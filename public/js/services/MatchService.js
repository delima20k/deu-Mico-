/**
 * @layer services
 * @group match
 * @role Service
 * @depends FirebaseService, MatchRepository, AuthService
 * @exports MatchService
 *
 * Serviço de partidas: presença em tempo real + chat com limitação.
 * Observa usuários ativos em filas/salas e gerencia mensagens de chat.
 * Usa RTDB via MatchRepository (não localStorage).
 */
import { MatchRepository } from '../repositories/MatchRepository.js';
import { LobbyRepository } from '../repositories/LobbyRepository.js';
import { AuthService } from '../services/AuthService.js';
import { FirebaseService } from '../services/FirebaseService.js';

export class MatchService {
  /** @type {MatchService|null} */
  static #instance = null;

  /** @type {MatchRepository} */
  #matchRepository;

  /** @type {LobbyRepository} */
  #lobbyRepository;

  /** @type {Map<string, Function>} Unsubscribers de listeners ativos (matchId -> unsubscribe) */
  #chatListeners = new Map();

  /** @type {Set<string>} Guard de limpeza de áudio em andamento (matchId:msgId) */
  #audioCleanupInFlight = new Set();

  /** @type {Set<string>} Guard de limpeza final de chat em andamento por partida */
  #matchChatCleanupInFlight = new Set();

  /** @type {Map<string, Object>} Fila local de retry de áudio (taskId -> task) */
  #audioRetryQueue = new Map();

  /** @type {Map<string, number>} Timers ativos de retry (taskId -> timeoutId) */
  #audioRetryTimers = new Map();

  /** @type {Set<string>} Assinaturas de áudio em envio para evitar reenvio duplicado */
  #audioInFlightSignatures = new Set();

  /** @type {Map<string, number>} Assinaturas enviadas recentemente (signatureKey -> ts) */
  #audioRecentlySentSignatures = new Map();

  /** @type {number[]} Backoff curto para retry de upload */
  #audioRetryBackoffMs = [1000, 2000, 4000];

  /** @type {number} Janela de deduplicação de reenvio acidental */
  #audioDedupeWindowMs = 5000;

  /** @type {boolean} Controle para registrar listeners de rede uma única vez */
  #audioNetworkListenersBound = false;

  /** @type {Function|null} */
  #handleAudioNetworkOnline = null;

  /** @type {Function|null} */
  #handleAudioNetworkOffline = null;

  /** @type {Map<string, Object[]>} Cache local de mensagens por matchId */
  #chatCache = new Map();

  /** @type {Map<string, number>} Timestamp da última mensagem por usuário (anti-spam) */
  #lastMessageTime = new Map();

  /** @type {number} Intervalo mínimo entre mensagens (ms) */
  #minMessageInterval = 1000;

  /** @type {Map<string, Function>} Unsubscribers de listeners de fila (lobbyType -> unsubscribe) */
  #queueListeners = new Map();

  /** @type {Map<string, Object>} Cache local de usuários por lobbyType */
  #queueCache = new Map();

  /** @type {Map<string, Function>} Unsubscribers de listeners de players do match (matchId -> unsubscribe) */
  #matchPlayersListeners = new Map();

  /** @type {Map<string, Function>} Unsubscribers de listeners de presença (matchId -> unsubscribe) */
  #presenceListeners = new Map();

  /** @type {Map<string, Object>} Refs de presença por chave '{matchId}_{uid}' (para cancelar onDisconnect) */
  #presenceRefs = new Map();

  // -------------------------------------------------------
  // Singleton
  // -------------------------------------------------------
  static getInstance() {
    if (!MatchService.#instance) {
      MatchService.#instance = new MatchService(
        MatchRepository.getInstance(),
        LobbyRepository.getInstance()
      );
    }
    return MatchService.#instance;
  }

  constructor(matchRepository, lobbyRepository) {
    this.#matchRepository = matchRepository;
    this.#lobbyRepository = lobbyRepository;
    this.#bindAudioNetworkListeners();
  }

  // -------------------------------------------------------
  // Presença (Onlinestatus) - localStorage temporário
  // -------------------------------------------------------

  /**
   * Registra presença do usuário em uma fila (ex: "queue_2p").
   * TODO: Migrar para Firebase presence + onDisconnect.
   * Por enquanto, stored em localStorage.
   * @param {string} userId
   * @param {string} queueKey - ex: "queue_2p", "queue_tournament"
   * @param {Object} userData - { name, avatarUrl }
   * @returns {Promise<void>}
   */
  async registerPresence(userId, queueKey, userData) {
    const key = `presence_${queueKey}`;
    const users = JSON.parse(localStorage.getItem(key) || '{}');
    users[userId] = { ...userData, joinedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(users));
  }

  /**
   * Remove presença do usuário de uma fila.
   * @param {string} userId
   * @param {string} queueKey
   */
  removePresence(userId, queueKey) {
    const key = `presence_${queueKey}`;
    const users = JSON.parse(localStorage.getItem(key) || '{}');
    delete users[userId];
    localStorage.setItem(key, JSON.stringify(users));
  }

  /**
   * Obtém lista de usuários presentes em uma fila.
   * @param {string} queueKey
   * @returns {Object} { userId: { name, avatarUrl, joinedAt } }
   */
  getQueueUsers(queueKey) {
    const key = `presence_${queueKey}`;
    return JSON.parse(localStorage.getItem(key) || '{}');
  }

  // -------------------------------------------------------
  // Chat — Via RTDB
  // -------------------------------------------------------

  /**
   * Envia mensagem de chat FASE 3.
   * Usa uid real do Firebase Auth, não userId arbitrário.
   * Implementa anti-spam (1 msg/seg por usuário).
   * @param {string} matchId - ex: "match_abc123"
   * @param {string} text - texto da mensagem
   * @returns {Promise<boolean>} true se enviada, false se bloqueada por anti-spam
   */
  async sendMessage(matchId, text) {
    try {
      // 1. Obtém uid real do Firebase
      const authService = AuthService.getInstance();
      const currentUser = await authService.getCurrentUser();
      
      if (!currentUser || !currentUser.uid) {
        console.error('[Chat] Usuário não autenticado');
        return false;
      }

      const uid = currentUser.uid;
      const now = Date.now();
      const lastTime = this.#lastMessageTime.get(uid) || 0;

      // 2. Anti-spam: 1 msg por segundo
      if (now - lastTime < this.#minMessageInterval) {
        console.warn(`[Chat] Anti-spam ativado para uid=${uid.slice(0, 8)}...`);
        return false;
      }

      // 3. Validação
      const trimmedText = (text || '').trim();
      if (!trimmedText) {
        console.warn('[Chat] Mensagem vazia');
        return false;
      }
      if (trimmedText.length > 200) {
        console.warn('[Chat] Mensagem > 200 caracteres');
        return false;
      }

      this.#lastMessageTime.set(uid, now);

      // 4. Nome: prefere displayName do próprio currentUser, fallback para parte local do email
      const profile = await authService.getProfile(uid).catch(() => null);
      const name = currentUser.displayName
        || profile?.name
        || currentUser.email?.split('@')[0]
        || 'Jogador';
      const avatarUrl = profile?.avatarUrl || currentUser.photoURL || '';

      // 5. Envia mensagem usando push() para chave ordenada do Firebase

      await this.#matchRepository.pushChatMessage(matchId, {
        type: 'text',
        uid,
        name,
        avatarUrl,
        text: trimmedText,
        ts: now,
      });

      return true;
    } catch (error) {
      console.error(`[Chat] Erro ao enviar mensagem:`, error);
      return false;
    }
  }

  /**
   * Envia mensagem de áudio no chat da partida.
   * Faz upload no Firebase Storage e persiste URL no RTDB.
   * @param {string} matchId
   * @param {{blob: Blob, mimeType?: string, durationMs?: number}} audioData
   * @returns {Promise<boolean>} true se enviada
   */
  async sendAudioMessage(matchId, audioData, options = {}) {
    try {
      const onStatus = typeof options?.onStatus === 'function' ? options.onStatus : () => {};

      const authService = AuthService.getInstance();
      const currentUser = await authService.getCurrentUser();

      if (!currentUser?.uid) {
        console.error('[AudioChat] Usuário não autenticado');
        onStatus({ state: 'failed', text: 'Sessão expirada. Faça login novamente.' });
        return false;
      }

      const authContext = await this.#ensureAudioUploadAuthContext(currentUser.uid);
      if (!authContext.ok || !authContext.uid) {
        console.error(`[AudioChatRealtime] auth inválida para upload reason=${authContext.reason || 'unknown'}`);
        onStatus({ state: 'failed', text: 'Sessão inválida para envio de áudio. Entre novamente.' });
        return false;
      }

      const uid = authContext.uid;
      console.log(
        `[AudioChatRealtime] auth pronta uid=${uid.slice(0, 8)}... provider=${authContext.providerIds.join(',') || 'unknown'} tokenExp=${authContext.tokenExpiration || 'n/a'} tokenHead=${authContext.tokenHead || 'n/a'}`
      );

      const now = Date.now();
      const lastTime = this.#lastMessageTime.get(uid) || 0;

      if (now - lastTime < this.#minMessageInterval) {
        console.warn(`[AudioChatRealtime] anti-spam uid=${uid.slice(0, 8)}...`);
        onStatus({ state: 'failed', text: 'Aguarde um instante para novo áudio' });
        return false;
      }

      const blob = audioData?.blob;
      if (!blob || !(blob instanceof Blob)) {
        console.warn('[AudioChatRealtime] blob inválido para envio');
        onStatus({ state: 'failed', text: 'Áudio inválido' });
        return false;
      }

      if (blob.size <= 0) {
        console.warn('[AudioChatRealtime] blob vazio');
        onStatus({ state: 'failed', text: 'Áudio vazio' });
        return false;
      }

      const mimeType = audioData?.mimeType || blob.type || 'audio/webm';
      const durationMs = Math.max(0, Number(audioData?.durationMs || 0));
      const signature = audioData?.signature
        || this.#buildAudioSignature(blob.size, durationMs, audioData?.recordedAt || now);
      const profile = await authService.getProfile(uid).catch(() => null);
      const name = currentUser.displayName
        || profile?.name
        || currentUser.email?.split('@')[0]
        || 'Jogador';
      const avatarUrl = profile?.avatarUrl || currentUser.photoURL || '';

      const signatureKey = `${uid}:${signature}`;
      this.#cleanupStaleAudioSignatures(now);

      if (this.#audioInFlightSignatures.has(signatureKey)) {
        console.log(`[AudioChatRealtime] envio ignorado (in-flight) signature=${signatureKey}`);
        return true;
      }

      const recentlySentAt = this.#audioRecentlySentSignatures.get(signatureKey) || 0;
      if (recentlySentAt && (now - recentlySentAt) < this.#audioDedupeWindowMs) {
        console.log(`[AudioChatRealtime] envio ignorado (duplicado recente) signature=${signatureKey}`);
        return true;
      }

      this.#lastMessageTime.set(uid, now);

      const msgId = this.#createClientAudioMessageId(uid, now);
      const taskId = `${matchId}:${msgId}`;
      if (this.#audioRetryQueue.has(taskId)) {
        console.log(`[AudioChatRealtime] envio já enfileirado taskId=${taskId}`);
        return true;
      }

      const task = {
        taskId,
        msgId,
        matchId,
        uid,
        name,
        avatarUrl,
        blob,
        mimeType,
        durationMs,
        createdAt: now,
        signatureKey,
        attempt: 0,
        maxAttempts: this.#audioRetryBackoffMs.length,
        status: 'queued',
        onStatus,
      };

      this.#audioRetryQueue.set(taskId, task);
      this.#audioInFlightSignatures.add(signatureKey);
      onStatus({ state: 'sending', text: 'enviando áudio...' });

      console.log(`[AudioChatRealtime] enqueue retry taskId=${taskId} size=${blob.size}`);

      const sent = await this.#processAudioSendTask(taskId);
      return sent || task.status === 'retry_waiting';
    } catch (error) {
      console.error('[AudioChatRealtime] erro ao enviar áudio:', error);
      return false;
    }
  }

  /**
   * Marca confirmação de reprodução de áudio por usuário.
   * @param {string} matchId
   * @param {string} msgId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async markAudioPlaybackAck(matchId, msgId, uid) {
    if (!matchId || !msgId || !uid) return;
    await this.#matchRepository.markChatAudioPlayback(matchId, msgId, uid);
    console.log(`[AudioChatRealtime] ack playback matchId=${matchId} msgId=${msgId} uid=${uid.slice(0, 8)}...`);
  }

  /**
   * Observa acks de reprodução de uma mensagem de áudio.
   * @param {string} matchId
   * @param {string} msgId
   * @param {(acks: Object) => void} onAcks
   * @returns {Function}
   */
  observeAudioPlaybackAck(matchId, msgId, onAcks) {
    return this.#matchRepository.observeChatAudioPlayback(matchId, msgId, onAcks);
  }

  /**
   * Verifica condição de limpeza do áudio e executa exclusão idempotente no Storage.
   * Condição: todos os jogadores relevantes (todos exceto autor) confirmaram playback.
   * @param {string} matchId
   * @param {{msgId?: string, uid?: string, storagePath?: string, cleanedAt?: number}} message
   * @param {string} requesterUid
   * @returns {Promise<void>}
   */
  async tryCleanupAudioAfterPlayback(matchId, message, requesterUid) {
    const msgId = message?.msgId;
    const authorUid = message?.uid;
    const storagePath = message?.storagePath;

    if (!matchId || !msgId || !authorUid) return;

    if (message?.cleanedAt) {
      console.log(`[AudioChatRealtime] cleanup skipped matchId=${matchId} msgId=${msgId} reason=already-cleaned`);
      return;
    }

    if (!storagePath) {
      console.log(`[AudioChatRealtime] cleanup skipped matchId=${matchId} msgId=${msgId} reason=no-storage-path`);
      return;
    }

    const key = `${matchId}:${msgId}`;
    if (this.#audioCleanupInFlight.has(key)) {
      console.log(`[AudioChatRealtime] cleanup skipped matchId=${matchId} msgId=${msgId} reason=in-flight`);
      return;
    }
    this.#audioCleanupInFlight.add(key);

    try {
      const [acks, relevantUids] = await Promise.all([
        this.#matchRepository.getChatAudioPlayback(matchId, msgId),
        this.#matchRepository.getRelevantPlaybackUids(matchId, authorUid),
      ]);

      const allAcked = relevantUids.length === 0
        || relevantUids.every((uid) => Boolean(acks?.[uid]?.playedAt));

      if (!allAcked) {
        console.log(`[AudioChatRealtime] cleanup skipped matchId=${matchId} msgId=${msgId} reason=acks-pending acks=${Object.keys(acks || {}).length}/${relevantUids.length}`);
        return;
      }

      const claimUid = requesterUid || 'unknown';
      const claimed = await this.#matchRepository.tryClaimChatAudioCleanup(matchId, msgId, claimUid);
      if (!claimed) {
        console.log(`[AudioChatRealtime] cleanup skipped matchId=${matchId} msgId=${msgId} reason=claim-lost`);
        return;
      }

      try {
        await this.#matchRepository.deleteChatAudioFile(storagePath);
      } catch (storageError) {
        const code = storageError?.code || '';
        if (code !== 'storage/object-not-found') {
          throw storageError;
        }
        console.log(`[AudioChatRealtime] arquivo já removido matchId=${matchId} msgId=${msgId}`);
      }

      await this.#matchRepository.markChatAudioCleanupDone(matchId, msgId, claimUid);
      console.log(`[AudioChatRealtime] cleanup done matchId=${matchId} msgId=${msgId}`);
    } catch (error) {
      console.error(`[AudioChatRealtime] erro no cleanup matchId=${matchId} msgId=${msgId}:`, error);
      try {
        await this.#matchRepository.releaseChatAudioCleanupClaim(matchId, msgId);
      } catch (releaseError) {
        console.warn('[AudioChatRealtime] falha ao liberar claim de cleanup:', releaseError);
      }
    } finally {
      this.#audioCleanupInFlight.delete(key);
    }
  }

  /**
   * Executa tentativa de envio de áudio com deduplicação de mensagem no RTDB.
   * @param {string} taskId
   * @returns {Promise<boolean>}
   */
  async #processAudioSendTask(taskId) {
    const task = this.#audioRetryQueue.get(taskId);
    if (!task) return false;

    task.status = 'uploading';
    task.onStatus?.({ state: 'sending', text: 'enviando áudio...' });

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('offline');
      }

      task.attempt += 1;
      console.log(`[AudioChatRealtime] retry attempt taskId=${task.taskId} attempt=${task.attempt}`);

      const upload = await this.#matchRepository.uploadChatAudio(
        task.matchId,
        task.uid,
        task.blob,
        task.mimeType
      );

      await this.#matchRepository.sendChatMessage(task.matchId, task.msgId, {
        type: 'audio',
        uid: task.uid,
        name: task.name,
        avatarUrl: task.avatarUrl,
        url: upload.url,
        durationMs: task.durationMs,
        mimeType: upload.contentType,
        storagePath: upload.path,
        ts: task.createdAt,
      });

      task.status = 'sent';
      task.onStatus?.({ state: 'sent', text: 'enviado' });
      this.#audioRecentlySentSignatures.set(task.signatureKey, Date.now());
      this.#audioInFlightSignatures.delete(task.signatureKey);
      this.#audioRetryQueue.delete(task.taskId);

      const timerId = this.#audioRetryTimers.get(task.taskId);
      if (timerId) {
        window.clearTimeout(timerId);
        this.#audioRetryTimers.delete(task.taskId);
      }

      return true;
    } catch (error) {
      const permissionDenied = this.#isAudioPermissionDeniedError(error);
      const retryable = this.#isRetryableAudioError(error);
      const hasMoreAttempts = task.attempt < task.maxAttempts;

      if (permissionDenied) {
        const fallbackSent = await this.#trySendAudioUnauthorizedFallback(task, error);
        if (fallbackSent) {
          task.status = 'sent';
          task.onStatus?.({ state: 'sent', text: 'enviado em modo compatibilidade' });
          this.#audioRecentlySentSignatures.set(task.signatureKey, Date.now());
          this.#audioInFlightSignatures.delete(task.signatureKey);
          this.#audioRetryQueue.delete(task.taskId);

          const timerId = this.#audioRetryTimers.get(task.taskId);
          if (timerId) {
            window.clearTimeout(timerId);
            this.#audioRetryTimers.delete(task.taskId);
          }

          return true;
        }

        task.status = 'failed';
        task.onStatus?.({ state: 'failed', text: 'Servidor recusou áudio (Storage 403). Faça login novamente.' });
        this.#audioInFlightSignatures.delete(task.signatureKey);
        this.#audioRetryQueue.delete(task.taskId);

        const denyTimerId = this.#audioRetryTimers.get(task.taskId);
        if (denyTimerId) {
          window.clearTimeout(denyTimerId);
          this.#audioRetryTimers.delete(task.taskId);
        }

        console.error(`[AudioChatRealtime] upload negado taskId=${task.taskId} code=${error?.code || 'unknown'}`);
        return false;
      }

      if (retryable && hasMoreAttempts) {
        const delayMs = this.#audioRetryBackoffMs[Math.max(0, task.attempt - 1)] || 4000;
        task.status = 'retry_waiting';
        task.onStatus?.({ state: 'retrying', text: 'falha de conexão, tentando novamente...' });

        console.warn(`[AudioChatRealtime] enqueue retry taskId=${task.taskId} nextIn=${delayMs}ms reason=${error?.message || 'network'}`);

        const oldTimerId = this.#audioRetryTimers.get(task.taskId);
        if (oldTimerId) {
          window.clearTimeout(oldTimerId);
        }

        const timerId = window.setTimeout(() => {
          this.#audioRetryTimers.delete(task.taskId);
          void this.#processAudioSendTask(task.taskId);
        }, delayMs);

        this.#audioRetryTimers.set(task.taskId, timerId);
        return false;
      }

      task.status = 'failed';
      if (permissionDenied) {
        task.onStatus?.({ state: 'failed', text: 'Permissão de áudio não configurada no servidor' });
      } else {
        task.onStatus?.({ state: 'failed', text: 'falha de conexão ao enviar áudio' });
      }
      this.#audioInFlightSignatures.delete(task.signatureKey);
      this.#audioRetryQueue.delete(task.taskId);

      const timerId = this.#audioRetryTimers.get(task.taskId);
      if (timerId) {
        window.clearTimeout(timerId);
        this.#audioRetryTimers.delete(task.taskId);
      }

      console.error(`[AudioChatRealtime] envio falhou taskId=${task.taskId}:`, error);
      return false;
    }
  }

  /**
   * Identificador idempotente para mensagem de áudio (evita duplicar push em retry).
   * @param {string} uid
   * @param {number} ts
   * @returns {string}
   */
  #createClientAudioMessageId(uid, ts) {
    const rand = Math.random().toString(36).slice(2, 8);
    return `audio_${uid.slice(0, 8)}_${ts}_${rand}`;
  }

  /**
   * Assinatura local leve para deduplicar reenvio acidental.
   * @param {number} size
   * @param {number} durationMs
   * @param {number} recordedAt
   * @returns {string}
   */
  #buildAudioSignature(size, durationMs, recordedAt) {
    const safeSize = Math.max(0, Number(size || 0));
    const safeDuration = Math.max(0, Math.round(Number(durationMs || 0)));
    const bucket = Math.floor(Math.max(0, Number(recordedAt || Date.now())) / 2000);
    return `${safeSize}:${safeDuration}:${bucket}`;
  }

  async #ensureAudioUploadAuthContext(expectedUid) {
    const firebaseService = FirebaseService.getInstance();
    const auth = firebaseService?.getAuth?.();
    const rawUser = auth?.currentUser || null;

    if (!rawUser?.uid) {
      return { ok: false, reason: 'missing-auth-user' };
    }

    if (expectedUid && rawUser.uid !== expectedUid) {
      console.warn(`[AudioChatRealtime] uid diferente no auth expected=${expectedUid.slice(0, 8)}... actual=${rawUser.uid.slice(0, 8)}...`);
    }

    try {
      const tokenResult = await rawUser.getIdTokenResult(true);
      const providerIds = Array.isArray(rawUser.providerData)
        ? rawUser.providerData.map((provider) => provider?.providerId).filter(Boolean)
        : [];

      return {
        ok: true,
        uid: rawUser.uid,
        providerIds,
        tokenExpiration: tokenResult?.expirationTime || null,
        tokenHead: (tokenResult?.token || '').slice(0, 12),
      };
    } catch (error) {
      console.error('[AudioChatRealtime] falha ao atualizar token antes do upload:', error);
      return { ok: false, reason: 'token-refresh-failed' };
    }
  }

  async #trySendAudioUnauthorizedFallback(task, originalError) {
    try {
      const fallbackAudioDataUrl = await this.#blobToSmallAudioDataUrl(task.blob, task.mimeType);
      if (!fallbackAudioDataUrl) {
        console.warn(`[AudioChatRealtime] fallback não enviado taskId=${task.taskId} reason=blob-too-large size=${task.blob?.size || 0}`);
        return false;
      }

      await this.#matchRepository.sendChatMessage(task.matchId, task.msgId, {
        type: 'audio',
        uid: task.uid,
        name: task.name,
        avatarUrl: task.avatarUrl,
        fallbackAudioDataUrl,
        durationMs: task.durationMs,
        mimeType: task.mimeType,
        storagePath: null,
        fallbackReason: 'storage-unauthorized',
        ts: task.createdAt,
      });

      console.warn(
        `[AudioChatRealtime] fallback data-url enviado taskId=${task.taskId} code=${originalError?.code || 'unknown'} chars=${fallbackAudioDataUrl.length}`
      );
      return true;
    } catch (fallbackError) {
      console.error('[AudioChatRealtime] erro no fallback de áudio:', fallbackError);
      return false;
    }
  }

  async #blobToSmallAudioDataUrl(blob, mimeType) {
    if (!blob || !(blob instanceof Blob)) return null;

    const maxBytes = 160 * 1024;
    if (blob.size > maxBytes) {
      return null;
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Falha ao converter áudio para data URL'));
      reader.readAsDataURL(blob);
    });

    const expectedPrefix = `data:${mimeType || 'audio/webm'};base64,`;
    if (!dataUrl.startsWith('data:audio/') && !dataUrl.startsWith(expectedPrefix)) {
      return null;
    }

    const maxChars = 240_000;
    if (dataUrl.length > maxChars) {
      return null;
    }

    return dataUrl;
  }

  /**
   * @param {Error|any} error
   * @returns {boolean}
   */
  #isRetryableAudioError(error) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return true;
    }

    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();

    if (this.#isAudioPermissionDeniedError(error)) {
      return false;
    }

    return code.includes('network')
      || code.includes('retry-limit-exceeded')
      || code.includes('unavailable')
      || message.includes('network')
      || message.includes('offline')
      || message.includes('failed to fetch');
  }

  #isAudioPermissionDeniedError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();
    return code.includes('storage/unauthorized')
      || code.includes('storage/permission-denied')
      || message.includes('storage/unauthorized')
      || message.includes('permission denied')
      || message.includes('forbidden');
  }

  #cleanupStaleAudioSignatures(now = Date.now()) {
    for (const [signatureKey, ts] of this.#audioRecentlySentSignatures.entries()) {
      if ((now - ts) > (this.#audioDedupeWindowMs * 3)) {
        this.#audioRecentlySentSignatures.delete(signatureKey);
      }
    }
  }

  #bindAudioNetworkListeners() {
    if (this.#audioNetworkListenersBound || typeof window === 'undefined') return;

    this.#handleAudioNetworkOnline = () => {
      console.log('[AudioChatRealtime] network online: retomando fila de áudio');
      for (const [taskId, task] of this.#audioRetryQueue.entries()) {
        if (task.status !== 'retry_waiting') continue;

        const timerId = this.#audioRetryTimers.get(taskId);
        if (timerId) {
          window.clearTimeout(timerId);
          this.#audioRetryTimers.delete(taskId);
        }

        void this.#processAudioSendTask(taskId);
      }
    };

    this.#handleAudioNetworkOffline = () => {
      console.warn('[AudioChatRealtime] network offline: aguardando reconexão para retry');
    };

    window.addEventListener('online', this.#handleAudioNetworkOnline);
    window.addEventListener('offline', this.#handleAudioNetworkOffline);
    this.#audioNetworkListenersBound = true;
  }

  /**
   * Obtém histórico de chat (retorna cache local).
   * @param {string} matchId
   * @returns {Array} Array de mensagens ordenadas por timestamp
   */
  getChatHistory(matchId) {
    const messages = this.#chatCache.get(matchId) || [];
    // Ordena por timestamp (crescente)
    return messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  /**
   * FASE 3: Observa novas mensagens em tempo real (onChildAdded incremental).
   * Usa MatchRepository.subscribeChat() com limitToLast(50).
   * Renderiza apenas novas mensagens (sem re-render tudo incorretamente).
   * 
   * @param {string} matchId
   * @param {(message: Object) => void} onMessage - callback com { msgId, uid, name, text, ts }
   * @returns {Function} Unsubscriber
   */
  subscribeChat(matchId, onMessage) {
    console.log(`[Chat] Iniciando subscribeChat para matchId="${matchId}"`);

    // Se já tem listener ativo, remove antes
    if (this.#chatListeners.has(matchId)) {
      console.warn(`[Chat] Listener já ativo para ${matchId}, removendo antigo`);
      const oldUnsub = this.#chatListeners.get(matchId);
      oldUnsub();
      this.#chatListeners.delete(matchId);
    }

    try {
      // Inicializa cache se não existe
      if (!this.#chatCache.has(matchId)) {
        this.#chatCache.set(matchId, []);
      }

      // Subscreve ao MatchRepository (usa onChildAdded)
      const unsubscribe = this.#matchRepository.subscribeChat(
        matchId,
        (message) => {
          // Adiciona mensagem ao cache
          const cache = this.#chatCache.get(matchId) || [];
          
          // Verifica se já existe (por msgId)
          const exists = cache.some(m => m.msgId === message.msgId);
          if (!exists) {
            cache.push(message);
            this.#chatCache.set(matchId, cache);
          }

          console.log(`[Chat] received msgId=${message.msgId} uid=${(message.uid || 'unknown').slice(0, 8)}...`);

          // Chama callback com mensagem individual (incremental)
          onMessage(message);
        }
      );

      // Guarda unsubscriber
      this.#chatListeners.set(matchId, unsubscribe);

      return unsubscribe;
    } catch (error) {
      console.error(`[Chat] Erro ao iniciar subscribeChat (${matchId}):`, error);
      return () => {};
    }
  }

  /**
   * Para de escutar novas mensagens para um matchId específico.
   * @param {string} matchId
   */
  stopSubscribingChat(matchId) {
    const unsubscribe = this.#chatListeners.get(matchId);
    if (unsubscribe) {
      unsubscribe();
      this.#chatListeners.delete(matchId);
      console.log(`[Chat] listener parado para matchId="${matchId}"`);
    }
  }

  /**
   * Observa novas mensagens em tempo real (Firebase onChildAdded).
   * Mantém cache local e chama callback ao receber mensagens.
   * @param {string} matchId
   * @param {(messages: Array) => void} callback - callback com array atualizado
   * @returns {Function} Unsubscriber
   */
  observeChat(matchId, callback) {
    console.log(`[Chat] Iniciando observer para matchId="${matchId}"`);

    // Inicializa cache se não existe
    if (!this.#chatCache.has(matchId)) {
      this.#chatCache.set(matchId, []);
    }

    // Se já tem listener ativo, remove antes
    if (this.#chatListeners.has(matchId)) {
      console.warn(`[Chat] Listener já ativo para ${matchId}, removendo antigo`);
      const oldUnsub = this.#chatListeners.get(matchId);
      oldUnsub();
      this.#chatListeners.delete(matchId);
    }

    try {
      // Subscreve ao MatchRepository
      const unsubscribe = this.#matchRepository.subscribeChat(
        matchId,
        (message) => {
          // Adiciona mensagem ao cache
          const cache = this.#chatCache.get(matchId) || [];
          
          // Verifica se já existe (por msgId)
          const exists = cache.some(m => m.msgId === message.msgId);
          if (!exists) {
            cache.push(message);
            this.#chatCache.set(matchId, cache);
          }

          // Chama callback com array atualizado
          callback(this.getChatHistory(matchId));
        }
      );

      // Guarda unsubscriber
      this.#chatListeners.set(matchId, unsubscribe);

      console.log(`[Chat] Observer ativo para matchId="${matchId}"`);
      return unsubscribe;
    } catch (error) {
      console.error(`[ChatError] Falha ao observar chat (${matchId}):`, error);
      return () => {};
    }
  }

  /**
   * Para de observar chat para um matchId específico.
   * @param {string} matchId
   */
  stopObservingChat(matchId) {
    const unsubscribe = this.#chatListeners.get(matchId);
    if (unsubscribe) {
      unsubscribe();
      this.#chatListeners.delete(matchId);
      console.log(`[Chat] Observer parado para matchId="${matchId}"`);
    }
  }

  // -------------------------------------------------------
  // Fila em Tempo Real — Via RTDB
  // -------------------------------------------------------

  /**
   * Observa usuários em fila em tempo real.
   * Mantém cache local e chama callback ao mudar contagem.
   * @param {string} lobbyType - ex: "2p", "6p", "tournament"
   * @param {(users: Object) => void} callback - { userId: userData, ... }
   * @returns {Function} Unsubscriber
   */
  subscribeQueueUsers(lobbyType, callback) {
    console.log(`[Queue] Iniciando listener para lobbyType="${lobbyType}"`);

    // Se já tem listener ativo, remove antes
    if (this.#queueListeners.has(lobbyType)) {
      console.warn(`[Queue] Listener já ativo para ${lobbyType}, removendo antigo`);
      const oldUnsub = this.#queueListeners.get(lobbyType);
      oldUnsub();
      this.#queueListeners.delete(lobbyType);
    }

    try {
      // Subscreve ao LobbyRepository
      const unsubscribe = this.#lobbyRepository.subscribeQueueUsers(
        lobbyType,
        (users) => {
          // Atualiza cache
          this.#queueCache.set(lobbyType, users || {});

          const count = Object.keys(users || {}).length;
          console.log(`[Queue] Atualizado: ${count} usuários em lobbyType="${lobbyType}"`);

          // Chama callback com usuários atualizados
          callback(users || {});
        }
      );

      // Guarda unsubscriber
      this.#queueListeners.set(lobbyType, unsubscribe);

      console.log(`[Queue] Listener ativo para lobbyType="${lobbyType}"`);
      return unsubscribe;
    } catch (error) {
      console.error(`[QueueError] Falha ao observar fila (${lobbyType}):`, error);
      return () => {};
    }
  }

  /**
   * Para de observar fila para um lobbyType específico.
   * @param {string} lobbyType
   */
  stopObservingQueue(lobbyType) {
    const unsubscribe = this.#queueListeners.get(lobbyType);
    if (unsubscribe) {
      unsubscribe();
      this.#queueListeners.delete(lobbyType);
      console.log(`[Queue] Listener parado para lobbyType="${lobbyType}"`);
    }
  }

  // -------------------------------------------------------
  // Match Players — Observa jogadores específicos do match
  // -------------------------------------------------------

  /**
   * Observa lista de jogadores em um match específico.
   * Busca de /matches/{matchId}/meta/players (ou structure similar).
   * Chama callback com array atualizado sempre que houver mudança.
   * 
   * @param {string} matchId - ID da partida
   * @param {(players: Object[]) => void} callback - callback com array de jogadores {uid, name, avatarUrl, joinedAt}
   * @returns {Function} Unsubscriber
   */
  observeMatchPlayers(matchId, callback) {
    console.log(`[GameTable] iniciando listener para matchId="${matchId}"`);

    // Se já tem listener ativo, remove antes
    if (this.#matchPlayersListeners.has(matchId)) {
      console.warn(`[GameTable] Listener já ativo para matchId="${matchId}", removendo antigo`);
      const oldUnsub = this.#matchPlayersListeners.get(matchId);
      oldUnsub();
      this.#matchPlayersListeners.delete(matchId);
    }

    try {
      // Usa MatchRepository para observar players do match
      const unsubscribe = this.#matchRepository.observeMatchPlayers(
        matchId,
        (players) => {
          // Converte objeto para array se necessário
          const playersArray = Array.isArray(players)
            ? players
            : Object.values(players || {});

          const count = playersArray.length;
          console.log(`[GameTable] atualizado: ${count} jogadores em matchId="${matchId}"`);

          // Chama callback com array atualizado
          callback(playersArray);
        }
      );

      // Guarda unsubscriber
      this.#matchPlayersListeners.set(matchId, unsubscribe);

      console.log(`[GameTable] listener ativo para matchId="${matchId}"`);
      return unsubscribe;
    } catch (error) {
      console.error(`[GameTable] Falha ao observar players (${matchId}):`, error);
      return () => {};
    }
  }

  /**
   * Para de observar players para um matchId específico.
   * @param {string} matchId
   */
  stopObservingMatch(matchId) {
    const unsubscribe = this.#matchPlayersListeners.get(matchId);
    if (unsubscribe) {
      unsubscribe();
      this.#matchPlayersListeners.delete(matchId);
      console.log(`[GameTable] listener parado para matchId="${matchId}"`);
    }
  }

  /**
   * Para de observar chat E match players para um matchId específico (limpeza total).
   * @param {string} matchId
   */
  stopObservingMatchFully(matchId) {
    this.stopObservingChat(matchId);
    this.stopObservingMatch(matchId);
  }

  /**
   * Sai de uma partida: remove presença e para todos os listeners do match.
   * NÃO deleta o match — apenas remove o jogador.
   * @param {string} matchId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async leaveMatch(matchId, uid) {
    console.log(`[GameExit] leaveMatch matchId=${matchId} uid=${uid?.slice(0, 8)}...`);
    this.stopObservingMatchFully(matchId);
    this.stopSubscribingPresence(matchId);
    await this.removePresence(matchId, uid);
    console.log(`[GameExit] presence removed uid=${uid?.slice(0, 8)}...`);
  }

  /**
   * Limpa todas as mensagens de chat de uma partida (game over).
   * @param {string} matchId
   * @returns {Promise<void>}
   */
  async clearChat(matchId) {
    try {
      this.stopObservingChat(matchId);
      await this.#matchRepository.clearChat(matchId);
      this.#chatCache.delete(matchId);
      console.log(`[Chat] Chat limpo para matchId="${matchId}"`);
    } catch (err) {
      console.warn(`[Chat] Erro ao limpar chat (${matchId}):`, err);
    }
  }

  /**
   * Limpa todo o chat da partida (RTDB + Storage) ao final do jogo.
   * Idempotente: múltiplas chamadas não quebram o fluxo.
   * @param {string} matchId
   * @returns {Promise<boolean>} true quando conclui sem falhas críticas
   */
  async cleanupMatchChatData(matchId) {
    if (!matchId) {
      console.warn('[ChatCleanup] cleanup ignorado: matchId ausente');
      return false;
    }

    if (this.#matchChatCleanupInFlight.has(matchId)) {
      console.log(`[ChatCleanup] cleanup já em andamento matchId=${matchId}`);
      return true;
    }

    this.#matchChatCleanupInFlight.add(matchId);

    try {
      console.log(`[ChatCleanup] iniciando cleanup final matchId=${matchId}`);

      this.stopObservingChat(matchId);
      await this.#matchRepository.clearMatchChatNodes(matchId);
      console.log(`[ChatCleanup] nós RTDB removidos matchId=${matchId}`);

      const storageResult = await this.#matchRepository.deleteMatchChatAudioFiles(matchId);
      console.log(
        `[ChatCleanup] storage concluído matchId=${matchId} deleted=${storageResult.deleted} skipped=${storageResult.skipped} failed=${storageResult.failed}`
      );

      this.#chatCache.delete(matchId);
      return storageResult.failed === 0;
    } catch (error) {
      console.error(`[ChatCleanup] falha no cleanup final matchId=${matchId}:`, error);
      return false;
    } finally {
      this.#matchChatCleanupInFlight.delete(matchId);
    }
  }

  // -------------------------------------------------------
  // Presença em Tempo Real (Firebase presence)
  // -------------------------------------------------------

  /**
   * Escreve presença do usuário em /matches/{matchId}/presence/{uid}.
   * Configura onDisconnect().remove() para limpeza automática.
   * 
   * @param {string} matchId - ID da partida
   * @param {string} uid - UID do usuário
   * @param {Object} userData - { name, avatarUrl, ... }
   * @returns {Promise<void>}
   */
  async writePresence(matchId, uid, userData) {
    try {
      const db = this.#matchRepository.getDatabase();
      const dbMod = this.#matchRepository.getDbModules();
      
      if (!db) {
        throw new Error('[Presence] Database não inicializado');
      }

      const presencePath = `matches/${matchId}/presence/${uid}`;
      const presenceRef = dbMod.ref(db, presencePath);
      // Armazena ref para cancelamento posterior do onDisconnect (proteção de segundo plano)
      this.#presenceRefs.set(`${matchId}_${uid}`, presenceRef);

      // Usa onDisconnect para remover presença automaticamente
      const presenceData = {
        uid,
        name: userData.name || 'Jogador Desconhecido',
        avatarUrl: userData.avatarUrl || null,
        joinedAt: Date.now(),
        lastSeen: Date.now(),
      };

      await dbMod.set(presenceRef, presenceData);
      
      // Configura remoção automática ao desconectar
      dbMod.onDisconnect(presenceRef).remove();

      console.log(`[Presence] my uid=${uid.slice(0, 8)}... wrote presence in ${matchId}`);

      // Incrementa joinedCount no meta (ativa status=active quando all players joined)
      try {
        const metaSnap = await dbMod.get(dbMod.ref(db, `matches/${matchId}/meta`));
        const metaVal = metaSnap.exists() ? metaSnap.val() : {};
        const maxPlayers = metaVal.maxPlayers || 2;
        await this.#matchRepository.incrementJoinedCount(matchId, maxPlayers);
      } catch (countErr) {
        console.warn(`[Presence] incrementJoinedCount falhou (não crítico):`, countErr);
      }
    } catch (error) {
      console.error(`[Presence] Erro ao escrever presença (${matchId}/${uid}):`, error);
      throw error;
    }
  }

  /**
   * Escuta mudanças em tempo real de presença: /matches/{matchId}/presence
   * Chama callback sempre que há mudança (novo jogador, saída, etc).
   * 
   * @param {string} matchId - ID da partida
   * @param {(players: Object[]) => void} callback - Recebe array de jogadores { uid, name, avatarUrl, joinedAt }
   * @returns {Function} Unsubscriber
   */
  subscribePresence(matchId, callback) {
    try {
      const db = this.#matchRepository.getDatabase();
      const dbMod = this.#matchRepository.getDbModules();

      if (!db) {
        console.error('[Presence] Database não inicializado');
        return () => {};
      }

      // Para listener anterior se existir
      if (this.#presenceListeners.has(matchId)) {
        const oldUnsub = this.#presenceListeners.get(matchId);
        oldUnsub();
        this.#presenceListeners.delete(matchId);
      }

      const presencePath = `matches/${matchId}/presence`;
      const presenceRef = dbMod.ref(db, presencePath);

      // Escuta mudanças em tempo real
      const unsubscribe = dbMod.onValue(presenceRef, (snapshot) => {
        const presenceData = snapshot.val() || {};
        const players = Object.values(presenceData);
        const count = players.length;

        console.log(`[Presence] count=${count} matchId=${matchId}`);

        // Chama callback com array de jogadores
        callback(players);
      }, (error) => {
        console.error(`[Presence] Erro ao escutar presença (${matchId}):`, error);
      });

      // Armazena unsubscriber
      this.#presenceListeners.set(matchId, unsubscribe);

      return unsubscribe;
    } catch (error) {
      console.error(`[Presence] Erro ao iniciar subscribePresence (${matchId}):`, error);
      return () => {};
    }
  }

  /**
   * Para de escutar presença para um matchId específico.
   * @param {string} matchId
   */
  stopSubscribingPresence(matchId) {
    const unsubscribe = this.#presenceListeners.get(matchId);
    if (unsubscribe) {
      unsubscribe();
      this.#presenceListeners.delete(matchId);
      console.log(`[Presence] listener parado para matchId="${matchId}"`);
    }
  }

  /**
   * Remove presença do usuário manualmente.
   * @param {string} matchId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async removePresence(matchId, uid) {
    try {
      const db = this.#matchRepository.getDatabase();
      const dbMod = this.#matchRepository.getDbModules();

      if (!db) {
        throw new Error('[Presence] Database não inicializado');
      }

      const presencePath = `matches/${matchId}/presence/${uid}`;
      const presenceRef = dbMod.ref(db, presencePath);
      await dbMod.remove(presenceRef);

      console.log(`[Presence] uid=${uid.slice(0, 8)}... presença removida`);
    } catch (error) {
      console.error(`[Presence] Erro ao remover presença (${matchId}/${uid}):`, error);
    }
  }

  // -------------------------------------------------------
  // Estado de Jogo (Embaralhar / Entregar)
  // -------------------------------------------------------

  /**
   * Escreve um evento de estado de jogo no RTDB.
   * Path: /matches/{matchId}/gameState
   * Chamado pelo dealer; todos os clientes subscribeGameState recebem o evento.
   *
   * @param {string} matchId
   * @param {{ phase: string, ts: number, [key: string]: any }} state
   * @returns {Promise<void>}
   */
  async writeGameState(matchId, state) {
    const db    = this.#matchRepository.getDatabase();
    const dbMod = this.#matchRepository.getDbModules();
    if (!db) throw new Error('[GameState] Database não inicializado');

    // Para turn_start: tenta via servidor primeiro (escrita autoritativa evita race conditions)
    if (state.phase === 'turn_start') {
      const apiOk = await this.#callNextTurnAPI(matchId, state).catch(() => false);
      if (apiOk) {
        const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        const env = isPWA ? 'PWA' : 'Navegador';
        console.log(`[TURNO] 🔄 Escrevendo turno → próximo: ${state.activeUid} | fase: ${state.phase} | offset: ${state.turnOffset} | ambiente: ${env} | matchId: ${matchId} | via: API`);
        return;
      }
      // Fallback: escrita direta se a API falhou
      console.warn('[TURNO] ⚠️ API falhou — usando escrita direta no Firebase');
    }

    const ref = dbMod.ref(db, `matches/${matchId}/gameState`);
    await dbMod.set(ref, state);
    console.log(`[GameState] escrito phase=${state.phase} matchId=${matchId}`);

    if (state.phase === 'turn_start') {
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      const env = isPWA ? 'PWA' : 'Navegador';
      console.log(`[TURNO] 🔄 Escrevendo turno → próximo: ${state.activeUid} | fase: ${state.phase} | offset: ${state.turnOffset} | ambiente: ${env} | matchId: ${matchId}`);
    }
  }

  /**
   * Tenta escrever a mudança de turno via endpoint serverless /api/next-turn.
   * O servidor usa Firebase Admin SDK — escrita autoritativa, evita race conditions.
   * Se falhar (offline, rede, API down), retorna false e o caller usa escrita direta.
   * @param {string} matchId
   * @param {Object} state - gameState com phase, activeUid, targetUid, turnOffset, ts
   * @returns {Promise<boolean>} true se o servidor escreveu com sucesso
   * @private
   */
  async #callNextTurnAPI(matchId, state) {
    try {
      const authService = AuthService.getInstance();
      const currentUser = await authService.getCurrentUser();
      const fromUid = currentUser?.uid;
      if (!fromUid) return false;

      const res = await fetch('/api/next-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          fromUid,
          toUid:      state.activeUid,
          targetUid:  state.targetUid,
          phase:      state.phase,
          turnOffset: state.turnOffset,
          ts:         state.ts,
        }),
      });
      const data = await res.json();
      // Verifica tanto o status HTTP quanto data.success:
      // A API pode retornar HTTP 200 com { success: false, reason: 'admin_not_configured' }
      // quando as env vars do Firebase Admin não estão configuradas no Vercel.
      // Nesse caso, o fallback de escrita direta no Firebase deve ser usado.
      if (!res.ok || !data.success) {
        console.warn('[next-turn API] Falhou:', data.error ?? data.reason ?? 'unknown');
        return false;
      }
      console.log('[next-turn API] ✅ Turno escrito pelo servidor');
      return true;
    } catch (e) {
      console.warn('[next-turn API] Erro de rede:', e.message);
      return false;
    }
  }

  /**
   * Escuta mudanças no estado de jogo em tempo real.
   * Retorna unsubscriber.
   *
   * @param {string} matchId
   * @param {(state: Object) => void} callback
   * @returns {Function} unsubscribe
   */
  subscribeGameState(matchId, callback) {
    try {
      const db    = this.#matchRepository.getDatabase();
      const dbMod = this.#matchRepository.getDbModules();
      if (!db) {
        console.warn('[GameState] Database não disponível — sincronização desativada');
        return () => {};
      }

      const ref   = dbMod.ref(db, `matches/${matchId}/gameState`);
      const unsub = dbMod.onValue(ref, async (snap) => {
        if (snap.exists()) {
          const data = snap.val();
          if (data?.phase === 'turn_start') {
            const currentUser = await AuthService.getInstance().getCurrentUser();
            const myUid = currentUser?.uid;
            const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
            const env = isPWA ? 'PWA' : 'Navegador';
            console.log(`[TURNO] 📥 Recebendo turno → activePlayer: ${data.activeUid} | target: ${data.targetUid} | fase: ${data.phase} | minha vez: ${data.activeUid === myUid} | ambiente: ${env}`);
          }
          callback(data);
        }
      }, (err) => {
        console.error('[GameState] Erro no listener:', err);
      });

      return unsub;
    } catch (err) {
      console.error('[GameState] Erro ao iniciar subscribeGameState:', err);
      return () => {};
    }
  }

  // -------------------------------------------------------
  // Benefícios de anúncio (campeonato 3+)
  // -------------------------------------------------------

  /**
   * Registra benefícios rewarded do usuário para uma partida específica.
   * Path: /matches/{matchId}/adBenefits/{uid}
   *
   * Estrutura:
   * {
   *   rewardedAt,
   *   updatedAt,
   *   eligibility: { roomType: 'tournament', minPlayers: 3 },
   *   rewards: {
   *     revealMico: { grantedAt, consumedAt, consumeCount, source },
   *     dealerSkipLeft: { grantedAt, consumedAt, consumeCount, source }
   *   }
   * }
   *
   * @param {string} matchId
   * @param {string} uid
   * @param {{ grantRevealMico?: boolean, grantDealerSkipLeft?: boolean, source?: string }} [options]
   * @returns {Promise<Object|null>}
   */
  async grantTournamentMatchBenefits(matchId, uid, options = {}) {
    const db = this.#matchRepository.getDatabase();
    const dbMod = this.#matchRepository.getDbModules();
    if (!db) throw new Error('[AdBenefits] Database não inicializado');
    if (!matchId || !uid) throw new Error('[AdBenefits] matchId/uid obrigatórios');

    const grantRevealMico = options.grantRevealMico !== false;
    const grantDealerSkipLeft = options.grantDealerSkipLeft !== false;
    const source = String(options.source || 'rewarded');

    const ref = dbMod.ref(db, `matches/${matchId}/adBenefits/${uid}`);
    const tx = await dbMod.runTransaction(ref, (current) => {
      const now = Date.now();
      const rewards = current?.rewards || {};
      const nextRewards = { ...rewards };

      if (grantRevealMico) {
        const prev = rewards.revealMico || {};
        nextRewards.revealMico = {
          grantedAt: prev.grantedAt || now,
          consumedAt: prev.consumedAt || null,
          consumeCount: Number(prev.consumeCount || 0),
          source: prev.source || source,
        };
      }

      if (grantDealerSkipLeft) {
        const prev = rewards.dealerSkipLeft || {};
        nextRewards.dealerSkipLeft = {
          grantedAt: prev.grantedAt || now,
          consumedAt: prev.consumedAt || null,
          consumeCount: Number(prev.consumeCount || 0),
          source: prev.source || source,
        };
      }

      return {
        ...(current || {}),
        rewardedAt: current?.rewardedAt || now,
        updatedAt: now,
        eligibility: {
          roomType: 'tournament',
          minPlayers: 3,
        },
        rewards: nextRewards,
      };
    });

    return tx?.snapshot?.val() || null;
  }

  /**
   * Consome (uma única vez) um benefício rewarded da partida.
   * Path: /matches/{matchId}/adBenefits/{uid}/rewards/{benefitKey}
   *
   * @param {string} matchId
   * @param {string} uid
   * @param {'revealMico'|'dealerSkipLeft'} benefitKey
   * @param {Object} [meta]
   * @returns {Promise<{consumed: boolean, state: Object|null}>}
   */
  async consumeTournamentMatchBenefit(matchId, uid, benefitKey, meta = {}) {
    const db = this.#matchRepository.getDatabase();
    const dbMod = this.#matchRepository.getDbModules();
    if (!db) throw new Error('[AdBenefits] Database não inicializado');
    if (!matchId || !uid || !benefitKey) {
      throw new Error('[AdBenefits] matchId/uid/benefitKey obrigatórios');
    }

    const ref = dbMod.ref(db, `matches/${matchId}/adBenefits/${uid}/rewards/${benefitKey}`);
    const tx = await dbMod.runTransaction(ref, (current) => {
      if (!current?.grantedAt) return current || null;
      if (current?.consumedAt) return current;

      const now = Date.now();
      return {
        ...current,
        consumedAt: now,
        consumeCount: Number(current?.consumeCount || 0) + 1,
        consumeMeta: {
          ...(current?.consumeMeta || {}),
          ...meta,
          ts: now,
        },
      };
    });

    const nextState = tx?.snapshot?.val() || null;
    return {
      consumed: Boolean(tx?.committed && nextState?.consumedAt),
      state: nextState,
    };
  }

  /**
   * Lê snapshot atual dos benefícios rewarded de um usuário na partida.
   * @param {string} matchId
   * @param {string} uid
   * @returns {Promise<Object|null>}
   */
  async getTournamentMatchBenefits(matchId, uid) {
    const db = this.#matchRepository.getDatabase();
    const dbMod = this.#matchRepository.getDbModules();
    if (!db) throw new Error('[AdBenefits] Database não inicializado');
    if (!matchId || !uid) return null;

    const ref = dbMod.ref(db, `matches/${matchId}/adBenefits/${uid}`);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : null;
  }

  /**
   * Observa benefícios rewarded do usuário na partida.
   * @param {string} matchId
   * @param {string} uid
   * @param {(data: Object|null) => void} callback
   * @returns {Function}
   */
  subscribeTournamentMatchBenefits(matchId, uid, callback) {
    try {
      const db = this.#matchRepository.getDatabase();
      const dbMod = this.#matchRepository.getDbModules();
      if (!db || !matchId || !uid) return () => {};

      const ref = dbMod.ref(db, `matches/${matchId}/adBenefits/${uid}`);
      return dbMod.onValue(ref, (snap) => {
        callback(snap.exists() ? snap.val() : null);
      }, (err) => {
        console.error('[AdBenefits] Erro no subscribeTournamentMatchBenefits:', err);
      });
    } catch (error) {
      console.error('[AdBenefits] Falha ao assinar benefícios do usuário:', error);
      return () => {};
    }
  }

  /**
   * Observa mapa completo de benefícios da partida (uid -> benefícios).
   * @param {string} matchId
   * @param {(data: Object) => void} callback
   * @returns {Function}
   */
  subscribeTournamentMatchBenefitsMap(matchId, callback) {
    try {
      const db = this.#matchRepository.getDatabase();
      const dbMod = this.#matchRepository.getDbModules();
      if (!db || !matchId) return () => {};

      const ref = dbMod.ref(db, `matches/${matchId}/adBenefits`);
      return dbMod.onValue(ref, (snap) => {
        callback(snap.exists() ? (snap.val() || {}) : {});
      }, (err) => {
        console.error('[AdBenefits] Erro no subscribeTournamentMatchBenefitsMap:', err);
      });
    } catch (error) {
      console.error('[AdBenefits] Falha ao assinar mapa de benefícios da partida:', error);
      return () => {};
    }
  }

  /**
   * Remove todos os listeners ativos e limpa cache.
   */
  cleanup() {
    this.#chatListeners.forEach((unsub, matchId) => {
      unsub();
      console.log(`[Chat] Cleanup: listener removido para ${matchId}`);
    });
    this.#chatListeners.clear();
    this.#chatCache.clear();

    this.#queueListeners.forEach((unsub, lobbyType) => {
      unsub();
      console.log(`[Queue] Cleanup: listener removido para ${lobbyType}`);
    });
    this.#queueListeners.clear();
    this.#queueCache.clear();

    this.#presenceListeners.forEach((unsub, matchId) => {
      unsub();
      console.log(`[Presence] Cleanup: listener removido para ${matchId}`);
    });
    this.#presenceListeners.clear();

    this.#audioRetryTimers.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    this.#audioRetryTimers.clear();
    this.#audioRetryQueue.clear();
    this.#audioInFlightSignatures.clear();
    this.#audioRecentlySentSignatures.clear();
    this.#matchChatCleanupInFlight.clear();

    this.#lastMessageTime.clear();
    console.log('[MatchService] Cleanup completo');
  }

  // -------------------------------------------------------
  // Eventos de Animação — Canal Push
  // -------------------------------------------------------

  /**
   * Faz push de um evento de animação no canal imutável do RTDB.
   * Usa push() — cada evento fica em sua própria chave, nunca sobrescreve.
   * @param {string} matchId
   * @param {Object} event - {type, fromClientUid, ...payload}
   * @returns {Promise<string|null>} pushId ou null se falhou
   */
  async pushAnimEvent(matchId, event) {
    try {
      return await this.#matchRepository.pushAnimEvent(matchId, event);
    } catch (err) {
      console.warn('[AnimEvent] Erro ao fazer push de evento de animação:', err);
      return null;
    }
  }

  /**
   * Subscreve a novos eventos de animação em tempo real (onChildAdded).
   * Retorna unsubscriber. Ignora eventos com mais de 10 segundos.
   * @param {string} matchId
   * @param {(event: Object) => void} onEvent
   * @returns {Function} unsubscribe
   */
  subscribeAnimEvents(matchId, onEvent) {
    return this.#matchRepository.subscribeAnimEvents(matchId, onEvent);
  }

  /**
   * Cancela o handler onDisconnect da presença para evitar remoção automática
   * quando o Firebase detecta desconexão (ex: PWA em segundo plano).
   * Chame writePresence() novamente ao voltar para o primeiro plano para restaurar.
   * @param {string} matchId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async cancelPresenceOnDisconnect(matchId, uid) {
    try {
      const presenceRef = this.#presenceRefs.get(`${matchId}_${uid}`);
      if (!presenceRef) {
        console.warn(`[Presence] cancelPresenceOnDisconnect: ref não encontrada para uid=${uid?.slice(0, 8)}`);
        return;
      }
      const dbMod = this.#matchRepository.getDbModules();
      if (!dbMod) return;
      await dbMod.onDisconnect(presenceRef).cancel();
      console.log(`[Presence] ✅ onDisconnect cancelado uid=${uid?.slice(0, 8)}`);
    } catch (err) {
      console.warn('[Presence] Erro ao cancelar onDisconnect (não crítico):', err);
    }
  }
}
