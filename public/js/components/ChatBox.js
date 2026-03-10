/**
 * @layer components
 * @group match
 * @role UI
 * @depends Dom, MatchService, AuthService
 * @exports ChatBox
 *
 * Caixa de chat para partida.
 * Exibe histórico de mensagens + input para enviar.
 * Usa uid real do Firebase e sincroniza com onChildAdded incremental.
 */
import { Dom } from '../utils/Dom.js';
import { MatchService } from '../services/MatchService.js';
import { AuthService } from '../services/AuthService.js';

export class ChatBox {
  /** @type {string} */
  #roomKey;

  /** @type {string|null} */
  #myUid = null;

  /** @type {HTMLElement|null} */
  #el = null;

  /** @type {HTMLElement|null} */
  #messagesContainer = null;

  /** @type {HTMLInputElement|null} */
  #input = null;

  /** @type {Function|null} */
  #unsubscribe = null;

  /**
   * @param {Object} options
   * @param {string} options.roomKey - ex: "match_abc123"
   * @param {string} [options.userId] - @deprecated (ignorado, usa uid real do Firebase)
   */
  constructor({ roomKey, userId }) {
    this.#roomKey = roomKey;
    // userId é ignorado - usamos uid real do Firebase em sendMessage()
  }

  /**
   * Cria e retorna o elemento do chat.
   * @returns {HTMLElement}
   */
  create() {
    const container = Dom.create('div', { classes: 'chat-box' });

    // Histórico de mensagens
    this.#messagesContainer = Dom.create('div', { classes: 'chat-box__messages' });

    // Input + botão enviar
    const inputArea = Dom.create('div', { classes: 'chat-box__input-area' });

    this.#input = Dom.create('input', {
      classes: 'chat-box__input',
      attrs: {
        type: 'text',
        placeholder: 'Mensagem...',
        maxlength: '100',
      },
    });

    const btnSend = Dom.create('button', {
      classes: 'chat-box__send-btn',
      text: '→',
      attrs: { type: 'button' },
    });

    const sendHandler = async () => {
      const text = this.#input.value.trim();
      if (!text) return;

      // FASE 3: Usa sendMessage() que obtém uid real do Firebase
      const sent = await MatchService.getInstance().sendMessage(
        this.#roomKey,
        text
      );

      if (sent) {
        this.#input.value = '';
      }
    };

    btnSend.addEventListener('click', sendHandler);
    this.#input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendHandler();
    });

    inputArea.append(this.#input, btnSend);
    container.append(this.#messagesContainer, inputArea);

    this.#el = container;

    // FASE 3: Usa subscribeChat com callback incremental
    this.#initializeFire();

    return container;
  }

  /**
   * Inicializa listeners de chat com uid real (FASE 3).
   * @private
   */
  async #initializeFire() {
    try {
      // Obtém uid real do usuário logado
      const authService = AuthService.getInstance();
      const currentUser = await authService.getCurrentUser();
      this.#myUid = currentUser?.uid || null;

      // Escuta novas mensagens (incremental com onChildAdded)
      this.#unsubscribe = MatchService.getInstance().subscribeChat(
        this.#roomKey,
        (message) => {
          // Renderiza apenas a nova mensagem (incremental)
          this.#renderMessage(message);
        }
      );
    } catch (error) {
      console.error('[ChatBox] Erro ao inicializar chat:', error);
    }
  }

  /**
   * Renderiza uma única mensagem (incremental).
   * @private
   */
  #renderMessage(message) {
    if (!this.#messagesContainer) return;

    const msgEl = Dom.create('div', {
      classes: [
        'chat-box__message',
        message.uid === this.#myUid ? 'chat-box__message--own' : '',
      ],
    });

    // Exibe nome + texto
    const nameEl = Dom.create('span', {
      classes: 'chat-box__message-name',
      text: message.name || 'Jogador',
    });

    const textEl = Dom.create('p', {
      classes: 'chat-box__message-text',
      text: message.text,
    });

    msgEl.append(nameEl, textEl);
    this.#messagesContainer.append(msgEl);

    // Scroll para o fim
    this.#messagesContainer.scrollTop = this.#messagesContainer.scrollHeight;
  }

  /**
   * Limpa listeners ao destruir.
   */
  destroy() {
    console.log(`[ChatBox] Destruindo listener para roomKey="${this.#roomKey}"`);
    
    if (this.#unsubscribe) {
      this.#unsubscribe();
      this.#unsubscribe = null;
    }
    
    // Também para observer no service (fallback)
    MatchService.getInstance().stopObservingChat(this.#roomKey);
  }

  /**
   * @returns {HTMLElement|null}
   */
  getElement() {
    return this.#el;
  }
}
