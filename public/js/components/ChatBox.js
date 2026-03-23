/**
 * @layer components
 * @group match
 * @role UI
 * @depends Dom, MatchService, AuthService
 * @exports ChatBox
 *
 * Chat em tempo real para a mesa de jogo.
 * Exibe botão flutuante no centro da mesa → abre modal de chat.
 * Mensagens sincronizadas via Firebase RTDB (onChildAdded).
 */
import { Dom } from '../utils/Dom.js';
import { MatchService } from '../services/MatchService.js';
import { AudioChatRecorderService } from '../services/AudioChatRecorderService.js';

export class ChatBox {
  /** @type {string} ID da partida */
  #matchId;

  /** @type {string|null} UID do jogador logado */
  #myUid = null;

  /** @type {Object[]} Lista de jogadores {uid, name, avatarUrl} */
  #players = [];

  /** @type {HTMLElement|null} Botão flutuante de chat */
  #btnEl = null;

  /** @type {HTMLElement|null} Overlay do modal */
  #modalEl = null;

  /** @type {HTMLElement|null} Container de mensagens */
  #messagesContainer = null;

  /** @type {HTMLInputElement|null} Campo de input */
  #input = null;

  /** @type {HTMLButtonElement|null} Botão de gravação de áudio */
  #audioBtn = null;

  /** @type {HTMLElement|null} Ícone interno do botão de áudio */
  #audioBtnIconEl = null;

  /** @type {Function|null} Unsubscriber do listener Firebase */
  #unsubscribe = null;

  /** @type {boolean} Modal está aberto? */
  #isOpen = false;

  /** @type {boolean} Estado atual da gravação */
  #isAudioRecording = false;

  /** @type {boolean} Finalização de gravação em andamento */
  #isAudioStopInFlight = false;

  /** @type {boolean} Ambiente bloqueia gravação de áudio */
  #isAudioEnvironmentBlocked = false;

  /** @type {AudioChatRecorderService} */
  #audioRecorder = AudioChatRecorderService.getInstance();

  /** @type {number} Contador de mensagens não lidas */
  #unreadCount = 0;

  /** @type {HTMLElement|null} Badge de não lidas */
  #unreadBadge = null;

  /** @type {Set<string>} Mensagens de áudio já confirmadas como reproduzidas */
  #audioAckedMsgIds = new Set();

  /** @type {Set<string>} Mensagens de áudio já processadas para autoplay */
  #audioAutoHandledMsgIds = new Set();

  /** @type {Map<string, {message: Object, audioEl: HTMLAudioElement, statusEl: HTMLElement|null}>} */
  #blockedAutoplayQueue = new Map();

  /** @type {Function|null} Handler global para tentar autoplay no próximo gesto */
  #retryAutoplayHandler = null;

  /** @type {number} Marca temporal de início do listener para evitar autoplay de histórico */
  #listeningStartedAt = 0;

  /** @type {HTMLElement|null} Estado discreto de envio do áudio */
  #audioStatusEl = null;

  /** @type {number|null} */
  #audioStatusTimer = null;

  /** @type {Map<string, number>} Assinaturas recentes de áudio para dedupe local */
  #recentAudioSignatures = new Map();

  /** @type {number} */
  #audioSignatureWindowMs = 5000;

  /**
   * @param {Object} options
   * @param {string} options.matchId - ID da partida
   * @param {string} options.myUid - UID do jogador logado
   * @param {Object[]} options.players - Lista de jogadores {uid, name, avatarUrl}
   */
  constructor({ matchId, myUid, players }) {
    this.#matchId = matchId;
    this.#myUid = myUid;
    this.#players = players || [];

    // Compatibilidade com chamadas legadas (roomKey/userId e players em objeto).
    const legacyOptions = arguments[0] || {};
    if (!this.#matchId && legacyOptions.roomKey) {
      this.#matchId = legacyOptions.roomKey;
    }
    if (!this.#myUid && legacyOptions.userId) {
      this.#myUid = legacyOptions.userId;
    }

    if (!Array.isArray(this.#players)) {
      if (this.#players && typeof this.#players === 'object') {
        this.#players = Object.entries(this.#players).map(([uid, value]) => ({
          uid,
          name: value?.name || 'Jogador',
          avatarUrl: value?.avatarUrl || '',
        }));
      } else {
        this.#players = [];
      }
    }

    this.#players = this.#players.map((player) => ({
      ...player,
      avatarUrl: this.#normalizeAvatarUrl(player?.avatarUrl),
    }));
  }

  /** @private */
  #normalizeAvatarUrl(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  /** @private */
  #getInitialFromName(name) {
    const trimmed = (name || '').trim();
    return (trimmed[0] || '?').toUpperCase();
  }

  /**
   * Cria e retorna o botão flutuante de chat.
   * @returns {HTMLElement}
   */
  create() {
    const btn = Dom.create('button', {
      classes: 'chat-btn',
      text: '💬',
      attrs: { type: 'button', 'aria-label': 'Abrir chat' },
    });

    this.#unreadBadge = Dom.create('span', { classes: 'chat-btn__badge' });
    this.#unreadBadge.style.display = 'none';
    btn.append(this.#unreadBadge);

    btn.addEventListener('click', () => this.open());
    this.#btnEl = btn;

    // Inicia listener de mensagens
    this.#startListening();

    return btn;
  }

  /** Abre o modal de chat */
  open() {
    if (this.#isOpen) return;
    this.#isOpen = true;

    this.#unreadCount = 0;
    this.#updateUnreadBadge();

    if (!this.#modalEl) {
      this.#buildModal();
    }

    this.#modalEl.classList.add('chat-modal--open');
    this.#btnEl?.classList.add('chat-btn--hidden');
    setTimeout(() => this.#input?.focus(), 300);
    this.#scrollToBottom();
  }

  /** Fecha o modal de chat */
  close() {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#modalEl?.classList.remove('chat-modal--open');
    this.#btnEl?.classList.remove('chat-btn--hidden');
  }

  /**
   * Limpa o chat no Firebase (game over).
   * @returns {Promise<void>}
   */
  async clearChat() {
    try {
      await MatchService.getInstance().clearChat(this.#matchId);
    } catch (err) {
      console.warn('[ChatBox] Erro ao limpar chat:', err);
    }
  }

  /** Remove listeners e limpa DOM */
  destroy() {
    if (this.#unsubscribe) {
      this.#unsubscribe();
      this.#unsubscribe = null;
    }
    MatchService.getInstance().stopObservingChat(this.#matchId);
    this.#modalEl?.remove();
    this.#modalEl = null;
    this.#teardownAutoplayRetryListener();
    this.#blockedAutoplayQueue.clear();
    this.#audioAckedMsgIds.clear();
    this.#audioAutoHandledMsgIds.clear();
    this.#audioBtn = null;
    this.#audioBtnIconEl = null;
    this.#isAudioRecording = false;
    this.#isAudioStopInFlight = false;
    this.#isAudioEnvironmentBlocked = false;
    this.#audioStatusEl = null;
    if (this.#audioStatusTimer) {
      window.clearTimeout(this.#audioStatusTimer);
      this.#audioStatusTimer = null;
    }
    this.#recentAudioSignatures.clear();
    this.#btnEl = null;
    this.#isOpen = false;
  }

  // ── Construção do modal ──────────────────────────────────────────

  /** @private */
  #buildModal() {
    const overlay = Dom.create('div', { classes: 'chat-modal' });
    const panel = Dom.create('div', { classes: 'chat-modal__panel' });

    // Header
    const header = Dom.create('div', { classes: 'chat-modal__header' });
    const title = Dom.create('span', {
      classes: 'chat-modal__title',
      text: 'Chat da Partida',
    });
    const btnClose = Dom.create('button', {
      classes: 'chat-modal__close',
      text: '✕',
      attrs: { type: 'button', 'aria-label': 'Fechar chat' },
    });
    btnClose.addEventListener('click', () => this.close());
    header.append(title, btnClose);

    // Avatares dos jogadores
    const avatarsRow = Dom.create('div', { classes: 'chat-modal__avatars' });
    for (const player of this.#players) {
      const avatarWrapper = Dom.create('div', { classes: 'chat-modal__avatar-item' });
      const avatarCircle = Dom.create('div', { classes: 'chat-modal__avatar-circle' });

      if (player.avatarUrl) {
        const img = Dom.create('img', {
          attrs: { src: player.avatarUrl, alt: player.name },
        });
        img.addEventListener('error', () => {
          if (img.parentElement !== avatarCircle) return;
          img.remove();
          const fallback = Dom.create('span', {
            classes: 'chat-modal__avatar-initials',
            text: this.#getInitialFromName(player.name),
          });
          avatarCircle.append(fallback);
        }, { once: true });
        avatarCircle.append(img);
      } else {
        const initials = Dom.create('span', {
          classes: 'chat-modal__avatar-initials',
          text: (player.name || '?')[0].toUpperCase(),
        });
        avatarCircle.append(initials);
      }

      const nameLabel = Dom.create('span', {
        classes: 'chat-modal__avatar-name',
        text: player.uid === this.#myUid ? 'Você' : player.name,
      });

      avatarWrapper.append(avatarCircle, nameLabel);
      avatarsRow.append(avatarWrapper);
    }

    // Mensagens
    this.#messagesContainer = Dom.create('div', { classes: 'chat-modal__messages' });

    // Input area
    const inputArea = Dom.create('div', { classes: 'chat-modal__input-area' });
    this.#audioStatusEl = Dom.create('span', {
      classes: 'chat-modal__audio-status',
      text: '',
    });
    this.#input = Dom.create('input', {
      classes: 'chat-modal__input',
      attrs: {
        type: 'text',
        placeholder: 'Digite uma mensagem...',
        maxlength: '200',
        autocomplete: 'off',
      },
    });
    const btnSend = Dom.create('button', {
      classes: 'chat-modal__send',
      text: '➤',
      attrs: { type: 'button', 'aria-label': 'Enviar mensagem' },
    });
    const btnAudio = Dom.create('button', {
      classes: 'chat-modal__audio-btn',
      text: '',
      attrs: { type: 'button', 'aria-label': 'Segure para gravar áudio' },
    });
    const audioIcon = Dom.create('span', {
      classes: 'chat-modal__audio-btn-icon',
      text: '🎙',
      attrs: { 'aria-hidden': 'true' },
    });
    const audioLabel = Dom.create('span', {
      classes: 'chat-modal__audio-btn-label',
      text: 'Áudio',
    });
    btnAudio.append(audioIcon, audioLabel);
    this.#audioBtn = btnAudio;
    this.#audioBtnIconEl = audioIcon;

    const sendHandler = () => {
      const text = this.#input.value.trim();
      if (!text) return;
      this.#input.value = '';
      this.#sendMessage(text);
    };

    btnSend.addEventListener('click', sendHandler);
    this.#input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendHandler();
    });
    try {
      this.#setupAudioButton(btnAudio);
    } catch (error) {
      const details = this.#audioRecorder.describeRecordingError(error);
      this.#setAudioButtonUnsupported(btnAudio, details.friendlyMessage || 'Microfone indisponivel neste ambiente.');
      this.#setAudioSendStatus({ state: 'failed', text: details.friendlyMessage || 'Microfone indisponivel neste ambiente.' });
    }

    inputArea.append(this.#input, btnAudio, btnSend, this.#audioStatusEl);
    panel.append(header, avatarsRow, this.#messagesContainer, inputArea);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    overlay.append(panel);
    document.body.append(overlay);
    this.#modalEl = overlay;
  }

  // ── Firebase ─────────────────────────────────────────────────────

  /** @private */
  #startListening() {
    this.#listeningStartedAt = Date.now();
    this.#unsubscribe = MatchService.getInstance().subscribeChat(
      this.#matchId,
      (message) => this.#onNewMessage(message),
    );
  }

  /** @private */
  async #sendMessage(text) {
    await MatchService.getInstance().sendMessage(this.#matchId, text);
  }

  /** @private */
  async #sendAudioMessage(audioPayload) {
    return MatchService.getInstance().sendAudioMessage(this.#matchId, audioPayload, {
      onStatus: (status) => this.#setAudioSendStatus(status),
    });
  }

  /** @private */
  #onNewMessage(message) {
    this.#renderMessage(message);
    if (!this.#isOpen) {
      this.#unreadCount++;
      this.#updateUnreadBadge();
    }
  }

  // ── Renderização ──────────────────────────────────────────────────

  /** @private */
  #renderMessage(msg) {
    if (!this.#messagesContainer) return;

    const isMine = msg.uid === this.#myUid;
    const incomingAvatarUrl = this.#normalizeAvatarUrl(msg?.avatarUrl);
    const playerIndex = this.#players.findIndex((p) => p.uid === msg.uid);
    const player = playerIndex >= 0 ? this.#players[playerIndex] : null;
    const senderName = isMine ? 'Você' : (msg.name || player?.name || 'Jogador');
    const avatarUrl = incomingAvatarUrl || this.#normalizeAvatarUrl(player?.avatarUrl);

    // Mantem cache local de jogadores atualizado com dados vindos do realtime.
    if (msg?.uid && (incomingAvatarUrl || msg?.name)) {
      const updatedPlayer = {
        uid: msg.uid,
        name: msg.name || player?.name || 'Jogador',
        avatarUrl: incomingAvatarUrl || this.#normalizeAvatarUrl(player?.avatarUrl),
      };
      if (playerIndex >= 0) {
        this.#players[playerIndex] = updatedPlayer;
      } else {
        this.#players.push(updatedPlayer);
      }
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message' + (isMine ? ' chat-message--mine' : '');

    // Coluna avatar + nome (sempre à esquerda)
    const avatarCol = document.createElement('div');
    avatarCol.className = 'chat-message__avatar-col';

    if (avatarUrl) {
      const img = document.createElement('img');
      img.className = 'chat-message__avatar';
      img.src = avatarUrl;
      img.alt = senderName;
      img.onerror = () => {
        img.style.display = 'none';
        const fallback = document.createElement('div');
        fallback.className = 'chat-message__avatar chat-message__avatar--initials';
        fallback.textContent = this.#getInitialFromName(senderName);
        avatarCol.insertBefore(fallback, avatarCol.firstChild);
      };
      avatarCol.appendChild(img);
    } else {
      const initial = document.createElement('div');
      initial.className = 'chat-message__avatar chat-message__avatar--initials';
      initial.textContent = this.#getInitialFromName(senderName);
      avatarCol.appendChild(initial);
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'chat-message__name';
    nameEl.textContent = senderName;
    avatarCol.appendChild(nameEl);

    // Conteúdo da mensagem
    const content = document.createElement('div');
    content.className = 'chat-message__content';

    const audioSrc = msg.url || msg.fallbackAudioDataUrl || '';

    if (msg.type === 'audio' && audioSrc) {
      const audioWrap = document.createElement('div');
      audioWrap.className = 'chat-message__audio';

      const audioEl = document.createElement('audio');
      audioEl.className = 'chat-message__audio-player';
      audioEl.controls = true;
      audioEl.preload = 'metadata';
      audioEl.src = audioSrc;

      const metaEl = document.createElement('span');
      metaEl.className = 'chat-message__meta';
      metaEl.textContent = msg.fallbackAudioDataUrl
        ? `Audio ${this.#formatDuration(msg.durationMs)} (modo compatibilidade)`
        : `Audio ${this.#formatDuration(msg.durationMs)}`;

      const autoStatusEl = document.createElement('span');
      autoStatusEl.className = 'chat-message__auto-status';

      audioWrap.append(audioEl, metaEl, autoStatusEl);
      content.appendChild(audioWrap);

      this.#handleIncomingAudioMessage(msg, audioEl, autoStatusEl, isMine);
    } else {
      const textEl = document.createElement('span');
      textEl.className = 'chat-message__text';
      textEl.textContent = msg.text || '';
      content.appendChild(textEl);
    }

    wrapper.appendChild(avatarCol);
    wrapper.appendChild(content);
    this.#messagesContainer.appendChild(wrapper);

    // Limita a 50 mensagens visíveis
    while (this.#messagesContainer.children.length > 50) {
      this.#messagesContainer.firstChild.remove();
    }

    this.#scrollToBottom();
  }

  /** @private */
  #scrollToBottom() {
    if (this.#messagesContainer) {
      requestAnimationFrame(() => {
        this.#messagesContainer.scrollTop = this.#messagesContainer.scrollHeight;
      });
    }
  }

  /** @private */
  #attachAudioPressEvents(btnAudio) {
    if (!btnAudio) return;

    const start = async (event) => {
      event?.preventDefault?.();
      if (this.#isAudioRecording || this.#isAudioStopInFlight || this.#isAudioEnvironmentBlocked || btnAudio.disabled) return;

      try {
        this.#setAudioSendStatus({ state: 'idle', text: '' });
        await this.#audioRecorder.startRecording();
        this.#isAudioRecording = true;
        btnAudio.classList.add('chat-modal__audio-btn--recording');
        this.#setAudioButtonVisualState('recording');
        console.log('[AudioChatRealtime] press-to-talk ativo');
      } catch (error) {
        const details = this.#audioRecorder.describeRecordingError(error);
        this.#setAudioSendStatus({ state: 'failed', text: details.friendlyMessage || 'Falha ao iniciar gravacao' });
        if (details.hardBlocked) {
          this.#setAudioButtonUnsupported(btnAudio, details.friendlyMessage || 'Microfone bloqueado neste ambiente.');
        }
      }
    };

    const stopAndSend = async (event) => {
      event?.preventDefault?.();
      if (!this.#isAudioRecording || this.#isAudioStopInFlight) return;

      this.#isAudioStopInFlight = true;
      this.#isAudioRecording = false;
      btnAudio.classList.remove('chat-modal__audio-btn--recording');
      this.#setAudioButtonVisualState('idle');

      try {
        const result = await this.#audioRecorder.stopRecording();
        const signature = result?.signature
          || this.#audioRecorder.buildRecordingSignature({
            size: result?.blob?.size || 0,
            durationMs: result?.durationMs || 0,
            recordedAt: result?.recordedAt || Date.now(),
          });

        if (this.#isDuplicateAudioSignature(signature)) {
          console.log(`[AudioChatRealtime] envio ignorado por dedupe local signature=${signature}`);
          this.#setAudioSendStatus({ state: 'sent', text: 'enviado' });
          return;
        }

        const wasSent = await this.#sendAudioMessage({
          ...result,
          signature,
        });

        if (!wasSent) {
          console.warn('[AudioChatRealtime] áudio não enviado (anti-spam ou validação)');
        }
      } catch (error) {
        this.#setAudioSendStatus({ state: 'failed', text: 'falha ao enviar áudio' });
        console.warn('[AudioChatRealtime] Falha ao finalizar envio de áudio:', error);
      } finally {
        this.#isAudioStopInFlight = false;
      }
    };

    const cancel = (event) => {
      event?.preventDefault?.();
      if (!this.#isAudioRecording) return;

      this.#isAudioRecording = false;
      this.#isAudioStopInFlight = false;
      btnAudio.classList.remove('chat-modal__audio-btn--recording');
      this.#setAudioButtonVisualState('idle');
      this.#audioRecorder.cancelRecording();
      this.#setAudioSendStatus({ state: 'idle', text: '' });
    };

    if (typeof window.PointerEvent === 'function') {
      btnAudio.addEventListener('pointerdown', async (event) => {
        if (typeof event.pointerId === 'number') {
          btnAudio.setPointerCapture(event.pointerId);
        }
        await start(event);
      });
      btnAudio.addEventListener('pointerup', stopAndSend);
      btnAudio.addEventListener('pointercancel', cancel);
      btnAudio.addEventListener('lostpointercapture', cancel);
    } else {
      btnAudio.addEventListener('touchstart', (event) => {
        void start(event);
      }, { passive: false });
      btnAudio.addEventListener('touchend', (event) => {
        void stopAndSend(event);
      }, { passive: false });
      btnAudio.addEventListener('touchcancel', cancel, { passive: false });
      btnAudio.addEventListener('mousedown', (event) => {
        void start(event);
      });
      btnAudio.addEventListener('mouseup', (event) => {
        void stopAndSend(event);
      });
      btnAudio.addEventListener('mouseleave', cancel);
    }
  }

  /** @private */
  #setupAudioButton(btnAudio) {
    if (!btnAudio) return;

    const support = this.#audioRecorder.getRecordingSupportStatus();
    if (!support.canRecord) {
      this.#setAudioButtonUnsupported(btnAudio, support.friendlyMessage || 'Microfone bloqueado neste ambiente.');
      this.#setAudioSendStatus({
        state: 'failed',
        text: support.friendlyMessage || 'Microfone bloqueado neste ambiente.',
      });
      return;
    }

    this.#isAudioEnvironmentBlocked = false;
    btnAudio.disabled = false;
    btnAudio.classList.remove('chat-modal__audio-btn--disabled');
    btnAudio.removeAttribute('title');
    btnAudio.setAttribute('aria-disabled', 'false');
    this.#setAudioButtonVisualState('idle');
    this.#attachAudioPressEvents(btnAudio);
  }

  /** @private */
  #setAudioButtonUnsupported(btnAudio, reason = 'Microfone bloqueado neste ambiente.') {
    if (!btnAudio) return;
    this.#isAudioEnvironmentBlocked = true;
    btnAudio.disabled = true;
    btnAudio.classList.remove('chat-modal__audio-btn--recording');
    btnAudio.classList.add('chat-modal__audio-btn--disabled');
    btnAudio.title = reason;
    btnAudio.setAttribute('aria-disabled', 'true');
    this.#setAudioButtonVisualState('unsupported');
  }

  /** @private */
  #setAudioButtonVisualState(state) {
    if (!this.#audioBtnIconEl || !this.#audioBtn) return;

    this.#audioBtn.classList.toggle('chat-modal__audio-btn--disabled', state === 'unsupported');

    if (state === 'recording') {
      this.#audioBtnIconEl.textContent = '●';
      return;
    }

    this.#audioBtnIconEl.textContent = '🎙';
  }

  /** @private */
  /** @private */
  #setAudioSendStatus(status) {
    if (!this.#audioStatusEl) return;

    if (this.#audioStatusTimer) {
      window.clearTimeout(this.#audioStatusTimer);
      this.#audioStatusTimer = null;
    }

    const state = status?.state || 'idle';
    const text = status?.text || '';

    this.#audioStatusEl.textContent = text;
    this.#audioStatusEl.classList.remove(
      'chat-modal__audio-status--sending',
      'chat-modal__audio-status--retrying',
      'chat-modal__audio-status--sent',
      'chat-modal__audio-status--failed'
    );

    if (!text) {
      this.#audioStatusEl.style.display = 'none';
      return;
    }

    this.#audioStatusEl.style.display = '';
    this.#audioStatusEl.classList.add(`chat-modal__audio-status--${state}`);

    if (state === 'sent') {
      this.#audioStatusTimer = window.setTimeout(() => {
        this.#setAudioSendStatus({ state: 'idle', text: '' });
      }, 1500);
    }
  }

  /** @private */
  #isDuplicateAudioSignature(signature) {
    if (!signature) return false;

    const now = Date.now();
    for (const [sig, ts] of this.#recentAudioSignatures.entries()) {
      if ((now - ts) > (this.#audioSignatureWindowMs * 3)) {
        this.#recentAudioSignatures.delete(sig);
      }
    }

    const lastTs = this.#recentAudioSignatures.get(signature) || 0;
    this.#recentAudioSignatures.set(signature, now);

    return lastTs > 0 && (now - lastTs) < this.#audioSignatureWindowMs;
  }

  /** @private */
  #handleIncomingAudioMessage(message, audioEl, statusEl, isMine) {
    if (!audioEl || !message?.msgId || isMine) {
      if (statusEl) statusEl.style.display = 'none';
      return;
    }

    const msgId = message.msgId;
    const audioService = MatchService.getInstance();

    const ackIfNeeded = async () => {
      if (this.#audioAckedMsgIds.has(msgId)) return;
      this.#audioAckedMsgIds.add(msgId);
      try {
        await audioService.markAudioPlaybackAck(this.#matchId, msgId, this.#myUid);
        await audioService.tryCleanupAudioAfterPlayback(this.#matchId, message, this.#myUid);
      } catch (error) {
        console.error(`[AudioChatRealtime] erro ao registrar ack msgId=${msgId}:`, error);
      }
    };

    audioEl.addEventListener('ended', () => {
      this.#setAutoStatus(statusEl, 'Reproduzido', false);
      void ackIfNeeded();
    }, { once: true });

    audioEl.addEventListener('play', () => {
      if (!this.#audioAckedMsgIds.has(msgId)) {
        this.#setAutoStatus(statusEl, '🔊 reproduzindo automaticamente', false);
      }
    });

    if (this.#audioAutoHandledMsgIds.has(msgId)) {
      return;
    }
    this.#audioAutoHandledMsgIds.add(msgId);

    if (this.#isHistoricalMessage(message)) {
      this.#setAutoStatus(statusEl, '', false);
      return;
    }

    void this.#tryAutoPlayMessage(message, audioEl, statusEl);
  }

  /** @private */
  async #tryAutoPlayMessage(message, audioEl, statusEl) {
    if (!audioEl || !message?.msgId) return;

    try {
      await audioEl.play();
      this.#blockedAutoplayQueue.delete(message.msgId);
      this.#setAutoStatus(statusEl, '🔊 reproduzindo automaticamente', false);
      console.log(`[AudioChatRealtime] autoplay ok msgId=${message.msgId}`);
    } catch (error) {
      const blocked = error?.name === 'NotAllowedError';
      if (!blocked) {
        this.#setAutoStatus(statusEl, 'Falha ao reproduzir áudio', true);
        console.warn(`[AudioChatRealtime] autoplay falhou msgId=${message.msgId}:`, error);
        return;
      }

      this.#blockedAutoplayQueue.set(message.msgId, { message, audioEl, statusEl });
      this.#setAutoStatus(statusEl, 'Toque para ouvir', true);
      this.#ensureAutoplayRetryListener();

      statusEl?.addEventListener('click', () => {
        void this.#retryBlockedAutoplay();
      }, { once: true });

      audioEl.addEventListener('click', () => {
        void this.#retryBlockedAutoplay();
      }, { once: true });

      console.log(`[AudioChatRealtime] autoplay bloqueado msgId=${message.msgId} (aguardando gesto do usuário)`);
    }
  }

  /** @private */
  #ensureAutoplayRetryListener() {
    if (this.#retryAutoplayHandler) return;

    this.#retryAutoplayHandler = () => {
      void this.#retryBlockedAutoplay();
    };

    document.addEventListener('pointerdown', this.#retryAutoplayHandler, true);
    document.addEventListener('keydown', this.#retryAutoplayHandler, true);
    document.addEventListener('touchstart', this.#retryAutoplayHandler, true);
  }

  /** @private */
  #teardownAutoplayRetryListener() {
    if (!this.#retryAutoplayHandler) return;
    document.removeEventListener('pointerdown', this.#retryAutoplayHandler, true);
    document.removeEventListener('keydown', this.#retryAutoplayHandler, true);
    document.removeEventListener('touchstart', this.#retryAutoplayHandler, true);
    this.#retryAutoplayHandler = null;
  }

  /** @private */
  async #retryBlockedAutoplay() {
    if (this.#blockedAutoplayQueue.size === 0) {
      this.#teardownAutoplayRetryListener();
      return;
    }

    const pending = Array.from(this.#blockedAutoplayQueue.entries());
    for (const [msgId, payload] of pending) {
      await this.#tryAutoPlayMessage(payload.message, payload.audioEl, payload.statusEl);
      if (!this.#blockedAutoplayQueue.has(msgId)) {
        console.log(`[AudioChatRealtime] autoplay retomado msgId=${msgId}`);
      }
    }

    if (this.#blockedAutoplayQueue.size === 0) {
      this.#teardownAutoplayRetryListener();
    }
  }

  /** @private */
  #setAutoStatus(statusEl, text, blocked) {
    if (!statusEl) return;

    if (!text) {
      statusEl.textContent = '';
      statusEl.style.display = 'none';
      statusEl.classList.remove('chat-message__auto-status--blocked');
      return;
    }

    statusEl.style.display = '';
    statusEl.textContent = text;
    statusEl.classList.toggle('chat-message__auto-status--blocked', Boolean(blocked));
  }

  /** @private */
  #isHistoricalMessage(message) {
    const ts = Number(message?.ts || message?.sentAt || 0);
    if (!ts) return false;
    return ts < (this.#listeningStartedAt - 1500);
  }

  /** @private */
  #formatDuration(durationMs) {
    const totalSeconds = Math.max(0, Math.round((Number(durationMs) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  /** @private */
  #updateUnreadBadge() {
    if (!this.#unreadBadge) return;
    if (this.#unreadCount > 0) {
      this.#unreadBadge.textContent = this.#unreadCount > 9 ? '9+' : String(this.#unreadCount);
      this.#unreadBadge.style.display = '';
    } else {
      this.#unreadBadge.style.display = 'none';
    }
  }

  /** @returns {HTMLElement|null} */
  getElement() {
    return this.#btnEl;
  }
}
