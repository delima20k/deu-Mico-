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

  /** @type {Function|null} Unsubscriber do listener Firebase */
  #unsubscribe = null;

  /** @type {boolean} Modal está aberto? */
  #isOpen = false;

  /** @type {number} Contador de mensagens não lidas */
  #unreadCount = 0;

  /** @type {HTMLElement|null} Badge de não lidas */
  #unreadBadge = null;

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

    inputArea.append(this.#input, btnSend);
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
    const player = this.#players.find(p => p.uid === msg.uid);
    const avatarUrl = player?.avatarUrl || msg.avatarUrl || '';
    const senderName = isMine ? 'Você' : (msg.name || player?.name || 'Jogador');

    const wrapper = Dom.create('div', {
      classes: ['chat-message', isMine ? 'chat-message--mine' : ''].filter(Boolean),
    });

    // Coluna esquerda: avatar + nome abaixo
    const avatarCol = Dom.create('div', { classes: 'chat-message__avatar-col' });

    let avatarEl;
    if (avatarUrl) {
      avatarEl = Dom.create('img', {
        classes: 'chat-message__avatar',
        attrs: { src: avatarUrl, alt: senderName },
      });
    } else {
      avatarEl = Dom.create('div', { classes: 'chat-message__avatar chat-message__avatar--initials' });
      const initial = Dom.create('span', {
        text: (senderName[0] || '?').toUpperCase(),
      });
      avatarEl.append(initial);
    }

    const nameEl = Dom.create('span', {
      classes: 'chat-message__name',
      text: senderName,
    });

    avatarCol.append(avatarEl, nameEl);

    // Conteúdo da mensagem
    const content = Dom.create('div', { classes: 'chat-message__content' });
    const textEl = Dom.create('span', {
      classes: 'chat-message__text',
      text: msg.text,
    });
    content.append(textEl);

    wrapper.append(avatarCol, content);
    this.#messagesContainer.append(wrapper);

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
