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

  /** @type {{code: string, friendlyMessage: string, hardBlocked: boolean}|null} */
  #environmentBlock = null;

  static getInstance() {
    if (!AudioChatRecorderService.#instance) {
      AudioChatRecorderService.#instance = new AudioChatRecorderService();
    }
    return AudioChatRecorderService.#instance;
  }

  /**
   * Retorna diagnóstico de capacidade para gravação no ambiente atual.
   * @returns {{
   *  isSupported: boolean,
   *  canRecord: boolean,
   *  secureContext: boolean,
   *  hasMediaDevices: boolean,
   *  hasGetUserMedia: boolean,
   *  hasMediaRecorder: boolean,
   *  permissionsPolicySupported: boolean,
   *  microphoneAllowedByPolicy: boolean|null,
   *  blockCode: string|null,
   *  friendlyMessage: string,
   *  hardBlocked: boolean,
   * }}
   */
  getRecordingSupportStatus() {
    const secureContext = this.#isSecureContext();
    const hasMediaDevices = Boolean(navigator?.mediaDevices);
    const hasGetUserMedia = typeof navigator?.mediaDevices?.getUserMedia === 'function';
    const hasMediaRecorder = typeof window.MediaRecorder === 'function';
    const policy = this.#readMicrophonePermissionsPolicy();

    let blockCode = null;
    let friendlyMessage = '';
    let hardBlocked = false;

    if (this.#environmentBlock?.hardBlocked) {
      blockCode = this.#environmentBlock.code;
      friendlyMessage = this.#environmentBlock.friendlyMessage;
      hardBlocked = true;
    } else if (!secureContext) {
      blockCode = 'INSECURE_CONTEXT';
      friendlyMessage = 'Microfone indisponivel fora de contexto seguro (HTTPS).';
      hardBlocked = true;
    } else if (!hasMediaDevices || !hasGetUserMedia || !hasMediaRecorder) {
      blockCode = 'UNSUPPORTED_BROWSER';
      friendlyMessage = 'Seu navegador nao suporta gravacao de audio.';
      hardBlocked = true;
    } else if (policy.supported && policy.allowed === false) {
      blockCode = 'PERMISSIONS_POLICY_BLOCKED';
      friendlyMessage = 'Microfone bloqueado neste ambiente.';
      hardBlocked = true;
    }

    return {
      isSupported: hasGetUserMedia && hasMediaRecorder,
      canRecord: !blockCode,
      secureContext,
      hasMediaDevices,
      hasGetUserMedia,
      hasMediaRecorder,
      permissionsPolicySupported: policy.supported,
      microphoneAllowedByPolicy: policy.allowed,
      blockCode,
      friendlyMessage,
      hardBlocked,
    };
  }

  /**
   * Retorna mensagem amigável e metadados para UX.
   * @param {any} error
   * @returns {{code: string, friendlyMessage: string, hardBlocked: boolean}}
   */
  describeRecordingError(error) {
    if (error?.code && error?.friendlyMessage) {
      return {
        code: error.code,
        friendlyMessage: error.friendlyMessage,
        hardBlocked: Boolean(error.hardBlocked),
      };
    }

    const mapped = this.#mapRecordingError(error);
    return {
      code: mapped.code,
      friendlyMessage: mapped.friendlyMessage,
      hardBlocked: mapped.hardBlocked,
    };
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

    const supportStatus = this.getRecordingSupportStatus();
    if (!supportStatus.canRecord) {
      throw this.#buildRecordingError({
        code: supportStatus.blockCode || 'UNSUPPORTED_ENVIRONMENT',
        friendlyMessage: supportStatus.friendlyMessage || 'Gravacao indisponivel neste ambiente.',
        hardBlocked: Boolean(supportStatus.hardBlocked),
      });
    }

    const mimeType = this.#resolveSupportedMimeType();
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const mapped = this.#mapRecordingError(error);
      if (mapped.hardBlocked) {
        this.#environmentBlock = {
          code: mapped.code,
          friendlyMessage: mapped.friendlyMessage,
          hardBlocked: true,
        };
      }
      throw this.#buildRecordingError(mapped, error);
    }

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
    let recorder = null;
    try {
      recorder = new MediaRecorder(stream, recorderOptions);
    } catch (error) {
      const mapped = this.#mapRecordingError(error);
      if (mapped.hardBlocked) {
        this.#environmentBlock = {
          code: mapped.code,
          friendlyMessage: mapped.friendlyMessage,
          hardBlocked: true,
        };
      }
      for (const track of stream.getTracks()) {
        track.stop();
      }
      this.#stream = null;
      throw this.#buildRecordingError(mapped, error);
    }

    recorder.ondataavailable = (event) => {
      if (event?.data && event.data.size > 0) {
        this.#chunks.push(event.data);
        this.#chunkCount += 1;
      }
    };

    // Chunks curtos preparam o terreno para upload progressivo no futuro.
    try {
      recorder.start(this.#timesliceMs);
    } catch (error) {
      const mapped = this.#mapRecordingError(error);
      if (mapped.hardBlocked) {
        this.#environmentBlock = {
          code: mapped.code,
          friendlyMessage: mapped.friendlyMessage,
          hardBlocked: true,
        };
      }
      for (const track of stream.getTracks()) {
        track.stop();
      }
      this.#cleanup();
      throw this.#buildRecordingError(mapped, error);
    }
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

  #isSecureContext() {
    if (window.isSecureContext) return true;

    const protocol = (window.location?.protocol || '').toLowerCase();
    const hostname = (window.location?.hostname || '').toLowerCase();

    if (protocol === 'https:') return true;
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }

  #readMicrophonePermissionsPolicy() {
    const policy = document?.permissionsPolicy || document?.featurePolicy || null;
    if (!policy || typeof policy.allowsFeature !== 'function') {
      return { supported: false, allowed: null };
    }

    try {
      const allowed = policy.allowsFeature('microphone');
      return { supported: true, allowed: Boolean(allowed) };
    } catch (_error) {
      return { supported: true, allowed: null };
    }
  }

  #mapRecordingError(error) {
    const name = String(error?.name || '');
    const message = String(error?.message || '').toLowerCase();

    if (name === 'NotAllowedError') {
      if (message.includes('permissions policy') || message.includes('not allowed in this document') || message.includes('feature policy')) {
        return {
          code: 'PERMISSIONS_POLICY_BLOCKED',
          friendlyMessage: 'Microfone bloqueado neste ambiente.',
          hardBlocked: true,
        };
      }

      return {
        code: 'MIC_PERMISSION_DENIED',
        friendlyMessage: 'Permita o microfone nas configuracoes do navegador.',
        hardBlocked: false,
      };
    }

    if (name === 'NotFoundError') {
      return {
        code: 'MIC_NOT_FOUND',
        friendlyMessage: 'Nenhum microfone foi encontrado neste dispositivo.',
        hardBlocked: false,
      };
    }

    if (name === 'SecurityError') {
      return {
        code: 'MIC_SECURITY_BLOCKED',
        friendlyMessage: 'Microfone bloqueado por configuracao de seguranca do navegador/site.',
        hardBlocked: true,
      };
    }

    if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') {
      return {
        code: 'MIC_DEVICE_UNAVAILABLE',
        friendlyMessage: 'Microfone ocupado ou indisponivel no momento.',
        hardBlocked: false,
      };
    }

    return {
      code: 'AUDIO_RECORDING_FAILED',
      friendlyMessage: 'Nao foi possivel iniciar a gravacao de audio.',
      hardBlocked: false,
    };
  }

  #buildRecordingError(mapped, cause = null) {
    const error = new Error(mapped.friendlyMessage);
    error.name = 'AudioChatRecordingError';
    error.code = mapped.code;
    error.friendlyMessage = mapped.friendlyMessage;
    error.hardBlocked = Boolean(mapped.hardBlocked);
    if (cause) {
      error.cause = cause;
    }
    return error;
  }
}
