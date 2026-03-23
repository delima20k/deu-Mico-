/**
 * @layer services
 * @group chat
 * @role Service
 * @depends browser MediaRecorder API
 * @exports AudioChatRecorderService
 *
 * Serviço utilitário de gravação de áudio para chat (press-to-talk).
 */
export class AudioChatRecorderService {
  /** @type {AudioChatRecorderService|null} */
  static #instance = null;

  /** @type {MediaRecorder|null} */
  #mediaRecorder = null;

  /** @type {MediaStream|null} */
  #stream = null;

  /** @type {BlobPart[]} */
  #chunks = [];

  /** @type {number} */
  #startedAt = 0;

  /** @type {string} */
  #mimeType = '';

  /** @type {Promise<{blob: Blob, mimeType: string, durationMs: number, chunkCount: number, recordedAt: number, signature: string}>|null} */
  #stopPromise = null;

  /** @type {number} */
  #recordingCycle = 0;

  /** @type {number} */
  #lastRecordedAt = 0;

  /** @type {number} */
  #chunkCount = 0;

  /** @type {number} */
  #timesliceMs = 250;

  static getInstance() {
    if (!AudioChatRecorderService.#instance) {
      AudioChatRecorderService.#instance = new AudioChatRecorderService();
    }
    return AudioChatRecorderService.#instance;
  }

  /**
   * Inicia a gravação de áudio.
   * @returns {Promise<void>}
   */
  async startRecording() {
    if (this.#mediaRecorder?.state === 'recording') {
      console.warn('[AudioChat] startRecording ignorado: já está gravando');
      return;
    }

    if (!navigator?.mediaDevices?.getUserMedia || typeof window.MediaRecorder !== 'function') {
      throw new Error('[AudioChat] MediaRecorder não suportado neste navegador');
    }

    const mimeType = this.#resolveSupportedMimeType();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.#chunks = [];
    this.#chunkCount = 0;
    this.#startedAt = Date.now();
    this.#lastRecordedAt = this.#startedAt;
    this.#mimeType = mimeType;
    this.#stopPromise = null;
    this.#recordingCycle += 1;
    this.#stream = stream;

    const recorderOptions = {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: 32000,
    };
    const recorder = new MediaRecorder(stream, recorderOptions);

    recorder.ondataavailable = (event) => {
      if (event?.data && event.data.size > 0) {
        this.#chunks.push(event.data);
        this.#chunkCount += 1;
      }
    };

    // Chunks curtos preparam o terreno para upload progressivo no futuro.
    recorder.start(this.#timesliceMs);
    this.#mediaRecorder = recorder;

    console.log(`[AudioChatRealtime] start cycle=${this.#recordingCycle} mimeType="${mimeType || recorder.mimeType || 'default'}" timeslice=${this.#timesliceMs}ms`);
  }

  /**
   * Finaliza a gravação e retorna o blob + metadados.
   * @returns {Promise<{blob: Blob, mimeType: string, durationMs: number, chunkCount: number, recordedAt: number, signature: string}>}
   */
  async stopRecording() {
    if (this.#stopPromise) {
      console.log('[AudioChatRealtime] stop ignorado: já em finalização');
      return this.#stopPromise;
    }

    const recorder = this.#mediaRecorder;
    if (!recorder) {
      throw new Error('[AudioChat] stopRecording sem gravação ativa');
    }

    const cycleId = this.#recordingCycle;

    if (recorder.state === 'inactive') {
      const durationMs = Math.max(0, Date.now() - this.#startedAt);
      const mimeType = this.#mimeType || 'audio/webm';
      const blob = new Blob(this.#chunks, { type: mimeType });
      const signature = this.buildRecordingSignature({
        size: blob.size,
        durationMs,
        recordedAt: this.#lastRecordedAt,
      });
      const chunkCount = this.#chunkCount;
      const recordedAt = this.#lastRecordedAt;
      this.#cleanup();

      return {
        blob,
        mimeType,
        durationMs,
        chunkCount,
        recordedAt,
        signature,
      };
    }

    this.#stopPromise = new Promise((resolve, reject) => {
      recorder.onerror = (event) => {
        console.error('[AudioChat] erro no MediaRecorder:', event);
        this.#cleanup();
        reject(new Error('[AudioChat] Falha ao gravar áudio'));
      };

      recorder.onstop = () => {
        const durationMs = Math.max(0, Date.now() - this.#startedAt);
        const mimeType = this.#mimeType || recorder.mimeType || 'audio/webm';
        const blob = new Blob(this.#chunks, { type: mimeType });
        const signature = this.buildRecordingSignature({
          size: blob.size,
          durationMs,
          recordedAt: this.#lastRecordedAt,
        });
        const chunkCount = this.#chunkCount;
        const recordedAt = this.#lastRecordedAt;

        this.#cleanup();

        if (!blob.size) {
          reject(new Error('[AudioChat] Áudio vazio')); 
          return;
        }

        console.log(`[AudioChatRealtime] stop cycle=${cycleId} size=${blob.size}B durationMs=${durationMs} chunks=${chunkCount}`);
        resolve({
          blob,
          mimeType,
          durationMs,
          chunkCount,
          recordedAt,
          signature,
        });
      };

      recorder.stop();
    });

    return this.#stopPromise;
  }

  /**
   * Cancela a gravação atual sem enviar áudio.
   */
  cancelRecording() {
    const recorder = this.#mediaRecorder;

    if (!recorder) return;

    try {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    } catch (error) {
      console.warn('[AudioChat] erro ao cancelar gravação:', error);
    } finally {
      this.#cleanup();
      console.log('[AudioChatRealtime] gravação cancelada');
    }
  }

  /**
   * Gera assinatura local para deduplicação de reenvio acidental.
   * @param {{size: number, durationMs: number, recordedAt: number}} input
   * @returns {string}
   */
  buildRecordingSignature(input) {
    const size = Math.max(0, Number(input?.size || 0));
    const durationMs = Math.max(0, Math.round(Number(input?.durationMs || 0)));
    const recordedAt = Math.max(0, Number(input?.recordedAt || Date.now()));
    const bucket = Math.floor(recordedAt / 2000);
    return `${size}:${durationMs}:${bucket}`;
  }

  #cleanup() {
    if (this.#stream) {
      for (const track of this.#stream.getTracks()) {
        track.stop();
      }
    }

    this.#mediaRecorder = null;
    this.#stream = null;
    this.#chunks = [];
    this.#chunkCount = 0;
    this.#startedAt = 0;
    this.#stopPromise = null;
    this.#mimeType = '';
  }

  #resolveSupportedMimeType() {
    const candidates = [
      'audio/ogg;codecs=opus',
      'audio/webm;codecs=opus',
      'audio/webm',
    ];

    if (typeof MediaRecorder?.isTypeSupported !== 'function') {
      console.warn('[AudioChat] MediaRecorder.isTypeSupported indisponível; usando fallback do navegador');
      return '';
    }

    const supported = candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
    if (!supported) {
      console.warn('[AudioChat] nenhum mimeType preferido suportado; usando default');
    }

    return supported;
  }
}
