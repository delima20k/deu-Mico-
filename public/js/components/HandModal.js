/**
 * @layer    components
 * @group    game
 * @role     Component
 * @depends  Dom
 * @exports  HandModal
 *
 * Modal fixo no rodape — exibe as cartas da mao do jogador em carrossel.
 *
 * Cada carta chega mostrando o verso (carta_verso.png) e executa flip 3D
 * para revelar o animal/frente um instante depois.
 *
 * Interacoes:
 *  - Arrastar tray  -> rola o carrossel (horizontal)
 *  - 1 toque/clique -> seleciona carta que tem par disponivel na mao
 *  - 2 toques/cliques sequenciais no par -> abre modal de confirmacao
 *  - Confirmar par  -> remove as duas cartas e dispara onPairFormed()
 */

import { Dom } from '../utils/Dom.js';
import { AudioChatRecorderService } from '../services/AudioChatRecorderService.js';

const BACK_IMG  = 'img/carta_verso.png';
const FLIP_DELAY = 320; // ms apos adicionar a carta antes de virar
const QUICK_CHAT_PHRASES = [
  'Com quem esta o mico? 🙈',
  'Cade o mico, doido? 👀',
  'Eu acho que o mico esta com augen 😜',
  'Passa esse mico pra la! 😂',
  'Nao sou eu, juro! 😅',
  'Segura esse mico! 🐵',
];
const QUICK_CHAT_EMOJIS = ['😂', '🙈', '👀', '🤯', '🐵', '🔥'];
const CHAT_COOLDOWN_MS = 1000;
const CHAT_CENSOR_PATTERNS = [
  /\bp[o0]r+r+a+\b/gi,
  /\bp[o0]h+a+\b/gi,
  /\bc[a@4]r+a+l+h+o+\b/gi,
  /\bc[a@4]r+a+i+o+\b/gi,
  /\bc[a@4]r+a+i+\b/gi,
  /\bk+r+l+\b/gi,
  /\bc+r+l+\b/gi,
  /\bm[e3]r+d+a+\b/gi,
  /\bb[uv]c+e+t+a+\b/gi,
  /\bbct\b/gi,
  /\bf+d+p+\b/gi,
  /\bfilh[oa]\s+d[ae]\s+p[uu]t+a+\b/gi,
  /\bfi\s+d[ae]\s+p[uu]t+a+\b/gi,
  /\bf[o0]d+a+\s*-?\s*s[e3]\b/gi,
  /\bf[o0]d+a+s[e3]\b/gi,
  /\bp[uu]t+a+\b/gi,
  /\bp[qk]+p+\b/gi,
  /\bp[uu]t+a+\s+q+[eu]+\s+p+a+r+i+[uuw]+\b/gi,
];

export class HandModal {
  // ── DOM
  #el       = null;   // .hand-modal
  #trackEl  = null;   // .hand-modal__track (itens do carrossel)
  #countEl  = null;   // span de contagem
  #chatRootEl = null;
  #chatComposerEl = null;
  #chatToggleBtnEl = null;
  #chatInputEl = null;
  #chatSendBtnEl = null;
  #chatAudioBtnEl = null;
  #chatAudioBtnIconEl = null;
  #chatStatusEl = null;
  #chatMessagesEl = null;
  #chatRenderedMessageIds = new Set();
  #chatCooldownTimer = null;
  #chatCooldownUntil = 0;
  #chatComposerOpen = false;
  #chatOnSendAudio = null;
  #isAudioRecording = false;
  #isAudioStopInFlight = false;
  #isAudioEnvironmentBlocked = false;
  #audioRecorder = AudioChatRecorderService.getInstance();

  // ── Estado de dados
  /** @type {import('../domain/Card.js').Card[]} */
  #cards = [];
  /** @type {Map<string, HTMLElement>} id -> .hand-modal__item */
  #itemEls = new Map();

  // ── Estado de selecao de par
  #selectedId = null;

  // ── Pares ja formados (para o modal de resumo)
  /** @type {Array<import('../domain/Card.js').Card[]>} */
  #formedPairs = [];

  /** Callback chamado apos confirmar par. */
  onPairFormed = null;
  #chatOnSend = null;
  #chatMyUid = null;
  #chatPlayers = [];

  // ─────────────────────────────────────────────────────────────────────
  // API publica
  // ─────────────────────────────────────────────────────────────────────

  /** Cria e insere o modal no body. Retorna o elemento raiz. */
  create() {
    // Remove instancia anterior se existir
    document.querySelector('.hand-modal')?.remove();

    const modal = Dom.create('div', { classes: 'hand-modal' });
    this.#el = modal;

    // Cabecalho
    const header = Dom.create('div', { classes: 'hand-modal__header' });
    const title  = Dom.create('span', { classes: 'hand-modal__title', text: 'Sua mao' });
    this.#countEl = Dom.create('span', { classes: 'hand-modal__count', text: '0' });
    header.append(title, this.#countEl);

    // Viewport do carrossel
    const viewport = Dom.create('div', { classes: 'hand-modal__viewport' });
    const track    = Dom.create('div', { classes: 'hand-modal__track'    });
    this.#trackEl  = track;
    viewport.append(track);

    const chat = Dom.create('div', { classes: 'hand-modal__chat' });
    this.#chatRootEl = chat;

    const toggleBtn = Dom.create('button', {
      classes: 'hand-modal__chat-toggle',
      text: 'Abrir chat',
      attrs: { type: 'button', 'aria-expanded': 'false' },
    });
    this.#chatToggleBtnEl = toggleBtn;

    const composer = Dom.create('div', { classes: 'hand-modal__chat-composer' });
    this.#chatComposerEl = composer;

    this.#chatMessagesEl = Dom.create('div', {
      classes: 'hand-modal__chat-messages',
      attrs: { 'aria-live': 'polite' },
    });

    const quickRow = Dom.create('div', { classes: 'hand-modal__chat-phrases' });
    for (const phrase of QUICK_CHAT_PHRASES) {
      const phraseBtn = Dom.create('button', {
        classes: 'hand-modal__chat-chip',
        text: phrase,
        attrs: { type: 'button' },
      });
      phraseBtn.addEventListener('click', () => this.#emitChat(phrase));
      quickRow.append(phraseBtn);
    }

    const emojiRow = Dom.create('div', { classes: 'hand-modal__chat-emojis' });
    for (const emoji of QUICK_CHAT_EMOJIS) {
      const emojiBtn = Dom.create('button', {
        classes: 'hand-modal__chat-emoji',
        text: emoji,
        attrs: { type: 'button', 'aria-label': `Enviar ${emoji}` },
      });
      emojiBtn.addEventListener('click', () => this.#emitChat(emoji));
      emojiRow.append(emojiBtn);
    }

    const inputRow = Dom.create('div', { classes: 'hand-modal__chat-input-row' });
    this.#chatInputEl = Dom.create('input', {
      classes: 'hand-modal__chat-input',
      attrs: {
        type: 'text',
        maxlength: '200',
        placeholder: 'Manda no chat...',
        autocomplete: 'off',
      },
    });
    const sendBtn = Dom.create('button', {
      classes: ['hand-modal__chat-send', 'hand-modal__chat-send-btn'],
      attrs: { type: 'button', 'aria-label': 'Enviar mensagem' },
    });
    sendBtn.hidden = true;
    const sendIcon = Dom.create('span', {
      classes: 'hand-modal__chat-send-icon',
      text: '➤',
      attrs: { 'aria-hidden': 'true' },
    });
    sendBtn.append(sendIcon);
    this.#chatSendBtnEl = sendBtn;

    const audioBtn = Dom.create('button', {
      classes: 'hand-modal__chat-audio-btn',
      attrs: { type: 'button', 'aria-label': 'Segure para gravar audio' },
    });
    const audioIcon = Dom.create('span', {
      classes: 'hand-modal__chat-audio-icon',
      text: '🎙',
      attrs: { 'aria-hidden': 'true' },
    });
    audioBtn.append(audioIcon);
    this.#chatAudioBtnEl = audioBtn;
    this.#chatAudioBtnIconEl = audioIcon;

    this.#chatStatusEl = Dom.create('div', {
      classes: 'hand-modal__chat-status',
      text: '',
      attrs: { 'aria-live': 'polite' },
    });

    const sendFromInput = () => {
      const text = (this.#chatInputEl?.value || '').trim();
      if (!text) return;
      this.#chatInputEl.value = '';
      this.#syncChatComposerActions();
      this.#emitChat(text);
    };

    sendBtn.addEventListener('click', sendFromInput);
    const syncInputState = () => this.#syncChatComposerActions();
    this.#chatInputEl.addEventListener('input', syncInputState);
    this.#chatInputEl.addEventListener('keyup', syncInputState);
    this.#chatInputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendFromInput();
      }
    });
    toggleBtn.addEventListener('click', () => {
      this.#setChatComposerOpen(!this.#chatComposerOpen);
    });

    this.#setupAudioButton(audioBtn);
    inputRow.append(this.#chatInputEl, audioBtn, sendBtn);
    composer.append(this.#chatMessagesEl, quickRow, emojiRow, inputRow, this.#chatStatusEl);
    chat.append(toggleBtn, composer);

    modal.append(header, viewport, chat);
    document.body.append(modal);

    this.#setChatComposerOpen(false);
    this.#syncChatComposerActions();

    this.#initDrag(viewport, track);
    return modal;
  }

  /**
   * Adiciona uma carta ao carrossel com animacao de flip verso->frente.
   * @param {import('../domain/Card.js').Card} card
   */
  addCard(card) {
    if (!this.#el || !this.#trackEl) return;

    // Exibe o modal na primeira carta
    if (this.#cards.length === 0) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          this.#el.classList.add('hand-modal--visible')
        )
      );
    }

    this.#cards.push(card);
    this.#updateCount();

    const item = this.#buildCardItem(card);
    this.#trackEl.append(item);
    this.#itemEls.set(card.id, item);

    // Flip verso -> frente apos FLIP_DELAY ms
    setTimeout(() => {
      item.querySelector('.hand-modal__card-inner')
          ?.classList.add('hand-modal__card-inner--flipped');
    }, FLIP_DELAY);

    // Rola suavemente ate a carta nova
    setTimeout(() => {
      item.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }, 60);

    this.#attachItemTap(item, card.id);
  }

  /**
   * Remove uma carta pelo id (chamado apos confirmar par).
   * @param {string} cardId
   * @param {boolean} [stolen=false]  true = animação de carta roubada (voo para cima)
   */
  removeCard(cardId, stolen = false) {
    const item = this.#itemEls.get(cardId);
    if (item) {
      if (stolen) {
        item.classList.add('hand-modal__item--stolen');
        setTimeout(() => item.remove(), 540);
      } else {
        item.classList.add('hand-modal__item--removing');
        setTimeout(() => item.remove(), 280);
      }
    }
    this.#itemEls.delete(cardId);
    this.#cards = this.#cards.filter(c => c.id !== cardId);
    this.#updateCount();
  }

  /** Destroi o modal e limpa o estado. */
  destroy() {
    document.querySelector('.hm-pair-modal')?.remove();
    this.#el?.remove();
    this.#el          = null;
    this.#trackEl     = null;
    this.#countEl     = null;
    this.#chatRootEl  = null;
    this.#chatComposerEl = null;
    this.#chatToggleBtnEl = null;
    this.#chatInputEl = null;
    this.#chatSendBtnEl = null;
    this.#chatAudioBtnEl = null;
    this.#chatAudioBtnIconEl = null;
    this.#chatStatusEl = null;
    this.#chatMessagesEl = null;
    this.#chatRenderedMessageIds.clear();
    if (this.#chatCooldownTimer) {
      clearInterval(this.#chatCooldownTimer);
      this.#chatCooldownTimer = null;
    }
    this.#chatCooldownUntil = 0;
    this.#cards       = [];
    this.#itemEls     = new Map();
    this.#selectedId  = null;
    this.#formedPairs = [];
    this.#chatComposerOpen = false;
    this.#chatOnSend  = null;
    this.#chatOnSendAudio = null;
    this.#chatMyUid   = null;
    this.#chatPlayers = [];
    this.#isAudioRecording = false;
    this.#isAudioStopInFlight = false;
    this.#isAudioEnvironmentBlocked = false;
  }

  /**
   * Configura callbacks e contexto do chat da modal.
   * @param {{ myUid: string, players: Array, onSend: (text: string) => Promise<void>|void, onSendAudio?: (audioPayload: object) => Promise<void>|void }} options
   */
  configureChat({ myUid, players, onSend, onSendAudio }) {
    this.#chatMyUid = myUid || null;
    this.#chatPlayers = players || [];
    this.#chatOnSend = onSend || null;
    this.#chatOnSendAudio = onSendAudio || null;
    this.#syncChatComposerActions();
  }

  /**
   * Renderiza uma mensagem em formato de bolha no chat da modal.
    * @param {{ msgId?: string, uid?: string, name?: string, text?: string, type?: string, url?: string, fallbackAudioDataUrl?: string, durationMs?: number, ts?: number, avatarUrl?: string }} message
   */
  appendChatMessage(message) {
    if (!message || !this.#chatMessagesEl) return;

    const msgId = message.msgId || `${message.uid || 'unknown'}:${message.ts || Date.now()}:${message.text || message.type || ''}`;
    if (this.#chatRenderedMessageIds.has(msgId)) return;
    this.#chatRenderedMessageIds.add(msgId);

    const isMine = message.uid === this.#chatMyUid;
    const row = Dom.create('div', {
      classes: ['hand-modal__chat-message', isMine ? 'hand-modal__chat-message--mine' : 'hand-modal__chat-message--other'],
    });

    const name = message.name
      || this.#chatPlayers.find((player) => player?.uid === message.uid)?.name
      || 'Jogador';

    const author = Dom.create('div', {
      classes: 'hand-modal__chat-message-author',
      text: isMine ? 'Voce' : name,
    });

    const bubble = Dom.create('div', { classes: 'hand-modal__chat-message-bubble' });
    const audioSrc = message.url || message.fallbackAudioDataUrl || '';
    const avatarUrl = this.#resolveChatAvatarUrl(message);

    if (message.type === 'audio' && audioSrc) {
      bubble.classList.add('hand-modal__chat-message-bubble--audio');

      const audioHeader = Dom.create('div', { classes: 'hand-modal__chat-audio-header' });
      const avatarEl = this.#buildChatAvatarElement(name, avatarUrl);
      const titleEl = Dom.create('span', {
        classes: 'hand-modal__chat-audio-name',
        text: isMine ? 'Voce' : name,
      });
      const indicatorEl = Dom.create('span', {
        classes: 'hand-modal__chat-audio-indicator',
        attrs: { 'aria-label': `Audio de ${name}` },
      });
      const indicatorIconEl = Dom.create('span', {
        classes: 'hand-modal__chat-audio-indicator-icon',
        text: '🔊',
        attrs: { 'aria-hidden': 'true' },
      });
      const indicatorWaveEl = Dom.create('span', { classes: 'hand-modal__chat-audio-indicator-wave' });
      for (let i = 0; i < 3; i++) {
        indicatorWaveEl.append(Dom.create('span', { classes: 'hand-modal__chat-audio-indicator-wave-bar' }));
      }
      indicatorEl.append(indicatorIconEl, indicatorWaveEl);
      audioHeader.append(avatarEl, titleEl, indicatorEl);

      const playbackRow = Dom.create('div', { classes: 'hand-modal__chat-audio-playback' });
      const playPauseBtn = Dom.create('button', {
        classes: 'hand-modal__chat-audio-play-btn',
        attrs: {
          type: 'button',
          'aria-label': `Reproduzir audio de ${name}`,
          'aria-pressed': 'false',
        },
      });
      const playPauseIcon = Dom.create('span', {
        classes: 'hand-modal__chat-audio-play-btn-icon',
        text: '▶',
        attrs: { 'aria-hidden': 'true' },
      });
      playPauseBtn.append(playPauseIcon);

      const audioEl = Dom.create('audio', {
        classes: ['hand-modal__chat-message-audio', 'hand-modal__chat-message-audio--hidden'],
        attrs: { preload: 'metadata', src: audioSrc },
      });
      const metaText = message.fallbackAudioDataUrl
        ? `Audio ${this.#formatDuration(message.durationMs)} (modo compatibilidade)`
        : `Audio ${this.#formatDuration(message.durationMs)}`;
      const meta = Dom.create('span', {
        classes: 'hand-modal__chat-message-meta',
        text: metaText,
      });

      const setSpeaking = (speaking) => {
        const isSpeaking = Boolean(speaking);
        indicatorEl.classList.toggle('hand-modal__chat-audio-indicator--speaking', isSpeaking);
        playPauseBtn.setAttribute('aria-pressed', isSpeaking ? 'true' : 'false');
        playPauseBtn.setAttribute('aria-label', `${isSpeaking ? 'Pausar' : 'Reproduzir'} audio de ${name}`);
        playPauseIcon.textContent = isSpeaking ? '⏸' : '▶';
      };

      playPauseBtn.addEventListener('click', () => {
        if (audioEl.paused) {
          audioEl.play().catch(() => {
            setSpeaking(false);
          });
          return;
        }
        audioEl.pause();
      });

      audioEl.addEventListener('play', () => setSpeaking(true));
      audioEl.addEventListener('pause', () => setSpeaking(false));
      audioEl.addEventListener('ended', () => setSpeaking(false));
      audioEl.addEventListener('waiting', () => setSpeaking(false));

      playbackRow.append(playPauseBtn, meta);
      bubble.append(audioHeader, playbackRow, audioEl);
    } else {
      const text = Dom.create('span', {
        classes: 'hand-modal__chat-message-text',
        text: message.text || '',
      });
      bubble.append(text);
    }

    row.append(author, bubble);
    this.#chatMessagesEl.append(row);

    if (this.#chatMessagesEl.children.length > 60) {
      this.#chatMessagesEl.removeChild(this.#chatMessagesEl.firstElementChild);
    }

    this.#chatMessagesEl.scrollTop = this.#chatMessagesEl.scrollHeight;
  }

  clearChatMessages() {
    if (this.#chatMessagesEl) {
      this.#chatMessagesEl.innerHTML = '';
    }
    this.#chatRenderedMessageIds.clear();
    this.#setChatStatus('', false);
  }

  #formatDuration(durationMs) {
    const totalSeconds = Math.max(0, Math.round((Number(durationMs) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  #resolveChatAvatarUrl(message) {
    const fromMessage = (message?.avatarUrl || '').trim();
    if (fromMessage) return fromMessage;

    const fromPlayers = this.#chatPlayers.find((player) => player?.uid === message?.uid)?.avatarUrl || '';
    return (fromPlayers || '').trim();
  }

  #getNameInitial(name) {
    const cleaned = (name || '').trim();
    return cleaned ? cleaned[0].toUpperCase() : '?';
  }

  #buildChatAvatarElement(name, avatarUrl) {
    const safeName = name || 'Jogador';
    const avatarEl = Dom.create('span', { classes: 'hand-modal__chat-audio-avatar' });
    const fallbackEl = Dom.create('span', {
      classes: 'hand-modal__chat-audio-avatar-fallback',
      text: this.#getNameInitial(safeName),
      attrs: { 'aria-hidden': 'true' },
    });

    if (!avatarUrl) {
      avatarEl.append(fallbackEl);
      return avatarEl;
    }

    const imgEl = Dom.create('img', {
      attrs: {
        src: avatarUrl,
        alt: safeName,
        loading: 'lazy',
        referrerpolicy: 'no-referrer',
      },
    });

    imgEl.addEventListener('error', () => {
      if (!avatarEl.contains(fallbackEl)) {
        avatarEl.innerHTML = '';
        avatarEl.append(fallbackEl);
      }
    });

    avatarEl.append(imgEl);
    return avatarEl;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Construcao do item de carta
  // ─────────────────────────────────────────────────────────────────────

  #buildCardItem(card) {
    const item  = Dom.create('div', { classes: 'hand-modal__item' });
    item.dataset.cardId = card.id;

    // Caixa 3-D de flip
    const inner = Dom.create('div', { classes: 'hand-modal__card-inner' });

    // Verso (carta_verso.png) -- visivel inicialmente
    const faceBack = Dom.create('div', { classes: ['hand-modal__card-face', 'hand-modal__card-face--back'] });
    const imgBack  = Dom.create('img', {
      attrs: { src: BACK_IMG, alt: 'verso', draggable: 'false' },
    });
    faceBack.append(imgBack);

    // Frente (animal) -- oculta ate o flip
    const faceFront = Dom.create('div', { classes: ['hand-modal__card-face', 'hand-modal__card-face--front'] });
    const imgFront  = Dom.create('img', {
      attrs: { src: card.faceImage, alt: card.name || '', draggable: 'false' },
    });
    faceFront.append(imgFront);

    inner.append(faceBack, faceFront);
    item.append(inner);
    return item;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Drag-to-scroll do carrossel
  // ─────────────────────────────────────────────────────────────────────

  #initDrag(viewport, _track) {
    // Usa scroll nativo do browser para máxima fluidez no mobile.
    // touch-action: pan-x é definido no CSS — o browser cuida do momentum/rubber-band.
    // O mouse ainda funciona via wheel e cursor grab.
    let startX = 0, scrollStart = 0, panning = false, moved = false;

    // Mouse — mantido para desktop
    const down = (e) => {
      startX      = e.clientX;
      scrollStart = viewport.scrollLeft;
      panning     = true;
      moved       = false;
    };
    const mouseMove = (e) => {
      if (!panning) return;
      const dx = startX - e.clientX;
      if (Math.abs(dx) > 4) moved = true;
      viewport.scrollLeft = scrollStart + dx;
    };
    const up = () => { panning = false; };

    viewport.addEventListener('mousedown',  down,      { passive: true });
    window.addEventListener ('mousemove',   mouseMove, { passive: true });
    window.addEventListener ('mouseup',     up);

    // Touch — apenas rastreia se houve movimento significativo (para diferenciar tap de scroll)
    viewport.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      moved  = false;
    }, { passive: true });
    viewport.addEventListener('touchmove', (e) => {
      if (Math.abs(e.touches[0].clientX - startX) > 8) moved = true;
    }, { passive: true });
    viewport.addEventListener('touchend', () => {}, { passive: true });

    this._moved = () => moved;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Deteccao de tap/clique em carta
  // ─────────────────────────────────────────────────────────────────────

  #attachItemTap(item, cardId) {
    let t0 = 0;

    const onTap = () => {
      // Ignora se foi um arrasto
      if (this._moved && this._moved()) return;

      const card = this.#cards.find(c => c.id === cardId);
      if (!card) return;

      // Carta sem par na mao — apenas pisca
      if (!this.#hasPair(card)) {
        item.classList.add('hand-modal__item--nopair');
        setTimeout(() => item.classList.remove('hand-modal__item--nopair'), 500);
        return;
      }

      // Ja tem uma carta selecionada?
      if (this.#selectedId && this.#selectedId !== cardId) {
        const selCard = this.#cards.find(c => c.id === this.#selectedId);
        if (selCard && selCard.pairId === card.pairId) {
          // Eh par! Mostra modal de confirmacao
          this.#clearSelection();
          this.#showPairModal(selCard, card);
          return;
        }
        // Nao eh par — desmarca anterior e seleciona este
        this.#clearSelection();
      }

      if (this.#selectedId === cardId) {
        this.#clearSelection();
      } else {
        this.#select(cardId);
      }
    };

    // Touch
    item.addEventListener('touchstart', () => { t0 = Date.now(); }, { passive: true });
    item.addEventListener('touchend', (e) => {
      if (Date.now() - t0 < 300) { e.preventDefault(); onTap(); }
    });

    // Mouse
    item.addEventListener('click', onTap);
  }

  #hasPair(card) {
    return this.#cards.some(c => c.id !== card.id && c.pairId === card.pairId && card.pairId != null);
  }

  #select(cardId) {
    this.#selectedId = cardId;
    const item = this.#itemEls.get(cardId);
    if (!item) return;
    item.classList.add('hand-modal__item--selected');
    // Eleva a carta selecionada para cima de todos os elementos
    item.style.zIndex = '99999';
    item.style.position = 'relative';
  }

  #clearSelection() {
    if (this.#selectedId) {
      const item = this.#itemEls.get(this.#selectedId);
      if (item) {
        item.classList.remove('hand-modal__item--selected');
        item.style.zIndex = '';
        item.style.position = '';
      }
    }
    this.#selectedId = null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Modal de confirmacao de par
  // ─────────────────────────────────────────────────────────────────────

  #showPairModal(cardA, cardB) {
    document.querySelector('.hm-pair-modal')?.remove();

    const overlay = Dom.create('div', { classes: 'hm-pair-modal' });
    const box     = Dom.create('div', { classes: 'hm-pair-modal__box' });

    const titleEl = Dom.create('h3', { classes: 'hm-pair-modal__title' });
    titleEl.textContent = 'Par encontrado! 🎉';

    // Novo par em destaque
    const newRow = Dom.create('div', { classes: 'hm-pair-modal__new-row' });
    const newLbl = Dom.create('p',   { classes: 'hm-pair-modal__lbl--new', text: 'Novo par:' });
    const cards  = Dom.create('div', { classes: 'hm-pair-modal__cards' });
    [cardA, cardB].forEach(c => {
      const w = Dom.create('div', { classes: 'hm-pair-modal__card' });
      const i = Dom.create('img', { attrs: { src: c.faceImage, alt: c.name || '' } });
      w.append(i);
      cards.append(w);
    });
    newRow.append(newLbl, cards);

    // Pares anteriores (se houver)
    let prevSection = null;
    if (this.#formedPairs.length > 0) {
      prevSection = Dom.create('div', { classes: 'hm-pair-modal__prev' });
      const prevLbl = Dom.create('p', { classes: 'hm-pair-modal__lbl--prev', text: 'Pares anteriores:' });
      const grid = Dom.create('div', { classes: 'hm-pair-modal__prev-grid' });
      for (const pair of this.#formedPairs) {
        const pw = Dom.create('div', { classes: 'hm-pair-modal__prev-pair' });
        for (const c of pair) {
          const img = Dom.create('img', {
            classes: 'hm-pair-modal__prev-img',
            attrs: { src: c.faceImage, alt: c.name || '' },
          });
          pw.append(img);
        }
        grid.append(pw);
      }
      prevSection.append(prevLbl, grid);
    }

    // Botoes
    const btns   = Dom.create('div',    { classes: 'hm-pair-modal__btns' });
    const btnOk  = Dom.create('button', { classes: ['hm-pair-modal__btn', 'hm-pair-modal__btn--ok'],
                                          text: '✔ Mover par' });
    const btnNo  = Dom.create('button', { classes: ['hm-pair-modal__btn', 'hm-pair-modal__btn--cancel'],
                                          text: 'Cancelar' });

    const close = () => overlay.remove();

    btnNo.addEventListener('click', () => { this.#clearSelection(); close(); });
    btnOk.addEventListener('click', () => {
      close();
      this.#formedPairs.push([cardA, cardB]);
      this.removeCard(cardA.id);
      this.removeCard(cardB.id);
      if (typeof this.onPairFormed === 'function') this.onPairFormed([cardA, cardB]);
    });

    btns.append(btnOk, btnNo);
    box.append(titleEl, newRow);
    if (prevSection) box.append(prevSection);
    box.append(btns);
    overlay.append(box);
    document.body.append(overlay);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────

  #updateCount() {
    if (!this.#countEl) return;
    const n = this.#cards.length;
    this.#countEl.textContent = n + ' carta' + (n !== 1 ? 's' : '');
  }

  async #emitChat(text) {
    const payload = (text || '').trim();
    if (!payload || typeof this.#chatOnSend !== 'function') return;

    if (Date.now() < this.#chatCooldownUntil) {
      this.#startChatCooldown();
      return;
    }

    const sanitized = this.#sanitizeChatText(payload);
    if (sanitized !== payload) {
      this.#setChatStatus('Mensagem moderada automaticamente.', false);
    }

    try {
      const wasSent = await this.#chatOnSend(sanitized);
      if (wasSent === false) {
        this.#setChatStatus('Aguarde 1s para enviar novamente.', true);
        this.#startChatCooldown();
        return;
      }

      this.#setChatStatus('Mensagem enviada!', false);
      this.#startChatCooldown();
    } catch (error) {
      console.warn('[HandModal] Falha ao enviar mensagem de chat:', error);
      this.#setChatStatus('Erro ao enviar mensagem.', true);
    }
  }

  #startChatCooldown() {
    this.#chatCooldownUntil = Date.now() + CHAT_COOLDOWN_MS;
    this.#toggleChatControls(true);

    if (this.#chatCooldownTimer) {
      clearInterval(this.#chatCooldownTimer);
      this.#chatCooldownTimer = null;
    }

    this.#chatCooldownTimer = setInterval(() => {
      const leftMs = this.#chatCooldownUntil - Date.now();
      if (leftMs <= 0) {
        clearInterval(this.#chatCooldownTimer);
        this.#chatCooldownTimer = null;
        this.#toggleChatControls(false);
        this.#setChatStatus('', false);
        return;
      }

      const leftSeconds = Math.max(1, Math.ceil(leftMs / 1000));
      this.#setChatStatus(`Aguarde ${leftSeconds}s...`, true);
    }, 80);
  }

  #toggleChatControls(disabled) {
    if (!this.#el) return;

    this.#chatInputEl?.toggleAttribute('disabled', disabled);
    const hasText = ((this.#chatInputEl?.value || '').trim().length > 0);
    this.#chatSendBtnEl?.toggleAttribute('disabled', disabled || !hasText);
    const shouldDisableAudio = disabled || this.#isAudioEnvironmentBlocked || typeof this.#chatOnSendAudio !== 'function';
    this.#chatAudioBtnEl?.toggleAttribute('disabled', shouldDisableAudio);

    const buttons = this.#el.querySelectorAll(
      '.hand-modal__chat-chip, .hand-modal__chat-emoji'
    );
    buttons.forEach((buttonEl) => buttonEl.toggleAttribute('disabled', disabled));
    this.#el.classList.toggle('hand-modal__chat--cooldown', disabled);
    this.#syncChatComposerActions();
  }

  #setChatComposerOpen(open) {
    this.#chatComposerOpen = Boolean(open);
    if (!this.#chatRootEl) return;

    this.#chatRootEl.classList.toggle('hand-modal__chat--open', this.#chatComposerOpen);
    this.#chatToggleBtnEl?.setAttribute('aria-expanded', this.#chatComposerOpen ? 'true' : 'false');
    if (this.#chatToggleBtnEl) {
      this.#chatToggleBtnEl.textContent = this.#chatComposerOpen ? 'Fechar chat' : 'Abrir chat';
    }

    if (this.#chatComposerOpen) {
      setTimeout(() => this.#chatInputEl?.focus(), 120);
    }

    this.#syncChatComposerActions();
  }

  #setChatStatus(text, isWarning) {
    if (!this.#chatStatusEl) return;
    this.#chatStatusEl.textContent = text || '';
    this.#chatStatusEl.classList.toggle('hand-modal__chat-status--warn', Boolean(isWarning));
  }

  #sanitizeChatText(text) {
    let sanitized = text;

    for (const pattern of CHAT_CENSOR_PATTERNS) {
      sanitized = sanitized.replace(pattern, (match) => {
        const visibleLength = match.replace(/\s/g, '').length;
        if (visibleLength <= 0) return match;
        return '*'.repeat(Math.min(visibleLength, 8));
      });
    }

    return sanitized;
  }

  #syncChatComposerActions() {
    const inputEl = this.#chatInputEl;
    const rowEl = inputEl?.closest('.hand-modal__chat-input-row');
    const sendBtn = this.#chatSendBtnEl;
    const audioBtn = this.#chatAudioBtnEl;

    if (!rowEl || !sendBtn || !audioBtn) return;

    const hasText = ((inputEl.value || '').trim().length > 0);
    const isInputDisabled = inputEl.hasAttribute('disabled');

    rowEl.classList.toggle('hand-modal__chat-input-row--has-text', hasText);

    sendBtn.hidden = !hasText;
    audioBtn.hidden = hasText;

    sendBtn.toggleAttribute('disabled', isInputDisabled || !hasText);
    const shouldDisableAudio = isInputDisabled || this.#isAudioEnvironmentBlocked || typeof this.#chatOnSendAudio !== 'function';
    audioBtn.toggleAttribute('disabled', shouldDisableAudio);
  }

  #setAudioButtonVisualState(state) {
    if (!this.#chatAudioBtnIconEl || !this.#chatAudioBtnEl) return;

    this.#chatAudioBtnEl.classList.toggle('hand-modal__chat-audio-btn--recording', state === 'recording');

    if (state === 'recording') {
      this.#chatAudioBtnIconEl.textContent = '●';
      return;
    }

    this.#chatAudioBtnIconEl.textContent = '🎙';
  }

  #applyAudioButtonBlockedState(audioBtn, reason) {
    if (!audioBtn) return;

    this.#isAudioEnvironmentBlocked = true;
    audioBtn.disabled = true;
    audioBtn.classList.remove('hand-modal__chat-audio-btn--recording');
    audioBtn.classList.add('hand-modal__chat-audio-btn--disabled');
    audioBtn.setAttribute('aria-disabled', 'true');
    audioBtn.title = reason || 'Microfone bloqueado neste ambiente';
    this.#setAudioButtonVisualState('idle');
  }

  async #emitChatAudio(audioPayload) {
    if (typeof this.#chatOnSendAudio !== 'function') return;

    if (Date.now() < this.#chatCooldownUntil) {
      this.#startChatCooldown();
      return;
    }

    try {
      const wasSent = await this.#chatOnSendAudio(audioPayload);
      if (wasSent === false) {
        this.#setChatStatus('Aguarde 1s para enviar novamente.', true);
        this.#startChatCooldown();
        return;
      }

      this.#setChatStatus('Audio enviado!', false);
      this.#startChatCooldown();
    } catch (error) {
      console.warn('[HandModal] Falha ao enviar audio de chat:', error);
      this.#setChatStatus('Erro ao enviar audio.', true);
    }
  }

  #setupAudioButton(audioBtn) {
    if (!audioBtn) return;

    const support = this.#audioRecorder.getRecordingSupportStatus();
    if (!support.canRecord) {
      const reason = support.friendlyMessage || 'Microfone bloqueado neste ambiente.';
      this.#applyAudioButtonBlockedState(audioBtn, reason);
      this.#setChatStatus(reason, true);
      return;
    }

    this.#isAudioEnvironmentBlocked = false;
    audioBtn.disabled = false;
    audioBtn.classList.remove('hand-modal__chat-audio-btn--disabled');
    audioBtn.removeAttribute('title');
    audioBtn.setAttribute('aria-disabled', 'false');

    const start = async (event) => {
      event?.preventDefault?.();
      if (this.#isAudioRecording || this.#isAudioStopInFlight || audioBtn.disabled) return;

      try {
        await this.#audioRecorder.startRecording();
        this.#isAudioRecording = true;
        this.#setAudioButtonVisualState('recording');
        this.#setChatStatus('Gravando audio... solte para enviar.', false);
      } catch (error) {
        const details = this.#audioRecorder.describeRecordingError(error);
        this.#setChatStatus(details.friendlyMessage || 'Falha ao iniciar gravacao.', true);
        if (details.hardBlocked) {
          this.#applyAudioButtonBlockedState(audioBtn, details.friendlyMessage);
        }
      }
    };

    const stopAndSend = async (event) => {
      event?.preventDefault?.();
      if (!this.#isAudioRecording || this.#isAudioStopInFlight) return;

      this.#isAudioStopInFlight = true;
      this.#isAudioRecording = false;
      this.#setAudioButtonVisualState('idle');

      try {
        const result = await this.#audioRecorder.stopRecording();
        await this.#emitChatAudio(result);
      } catch (error) {
        this.#setChatStatus('Falha ao enviar audio.', true);
        console.warn('[HandModal] Falha ao finalizar envio de audio:', error);
      } finally {
        this.#isAudioStopInFlight = false;
      }
    };

    const cancel = (event) => {
      event?.preventDefault?.();
      if (!this.#isAudioRecording) return;

      this.#isAudioRecording = false;
      this.#isAudioStopInFlight = false;
      this.#setAudioButtonVisualState('idle');
      this.#audioRecorder.cancelRecording();
      this.#setChatStatus('', false);
    };

    if (typeof window.PointerEvent === 'function') {
      audioBtn.addEventListener('pointerdown', async (event) => {
        if (typeof event.pointerId === 'number') {
          audioBtn.setPointerCapture(event.pointerId);
        }
        await start(event);
      });
      audioBtn.addEventListener('pointerup', stopAndSend);
      audioBtn.addEventListener('pointercancel', cancel);
      audioBtn.addEventListener('lostpointercapture', cancel);
    } else {
      audioBtn.addEventListener('touchstart', (event) => {
        void start(event);
      }, { passive: false });
      audioBtn.addEventListener('touchend', (event) => {
        void stopAndSend(event);
      }, { passive: false });
      audioBtn.addEventListener('touchcancel', cancel, { passive: false });
      audioBtn.addEventListener('mousedown', (event) => {
        void start(event);
      });
      audioBtn.addEventListener('mouseup', (event) => {
        void stopAndSend(event);
      });
      audioBtn.addEventListener('mouseleave', cancel);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // API pública de consulta (usada pelo sistema de turnos)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Retorna a carta que forma par com `card` (mesmo pairId, id diferente), ou null.
   * @param {import('../domain/Card.js').Card} card
   * @returns {import('../domain/Card.js').Card|null}
   */
  findPairFor(card) {
    return this.#cards.find(
      c => c.id !== card.id && c.pairId != null && c.pairId === card.pairId
    ) ?? null;
  }

  /**
   * Retorna uma cópia rasa das cartas atuais na mão.
   * @returns {import('../domain/Card.js').Card[]}
   */
  getCards() {
    return [...this.#cards];
  }

  /**
   * Move o viewport do carrossel para a posição proporcional (0–1).
   * Chamado em tempo real quando o picker sincroniza o scroll via Firebase.
   * @param {number} ratio  0 = início, 1 = fim
   */
  setScrollRatio(ratio) {
    const viewportEl = this.#el?.querySelector('.hand-modal__viewport');
    if (!viewportEl) return;
    const max = viewportEl.scrollWidth - viewportEl.clientWidth;
    if (max <= 0) return;
    // Força posicionamento instantâneo (ignora scroll-behavior: smooth do CSS)
    // para garantir sincronização fiel em tempo real em todos os browsers.
    viewportEl.style.scrollBehavior = 'auto';
    viewportEl.scrollLeft = Math.round(ratio * max);
    viewportEl.style.scrollBehavior = '';
  }
}
