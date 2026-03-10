/**
 * @layer components
 * @group lobby
 * @role UI
 * @depends Dom, SoundManager
 * @exports LobbyCard
 *
 * Card para seleção de fila/sala (2p, 3p, 4p...).
 * Exibe: título, número de jogadores, botão entrar, contador de presentes.
 */
import { Dom } from '../utils/Dom.js';
import { SoundManager } from '../utils/SoundManager.js';

export class LobbyCard {
  /** @type {string} */
  #playersCount;

  /** @type {string} */
  #queueKey;

  /** @type {Function|null} */
  #onJoin = null;

  /** @type {HTMLElement|null} */
  #el = null;

  /** @type {number} */
  #presenceCount = 0;

  /**
   * @param {Object} options
   * @param {number} options.playersCount - ex: 2, 3, 4, 5, 6
   * @param {string} options.queueKey - ex: "queue_2p"
   * @param {number} [options.presenceCount=0] - quantos presentes
   * @param {Function} [options.onJoin] - callback ao clicar
   */
  constructor({ playersCount, queueKey, presenceCount = 0, onJoin = null }) {
    this.#playersCount = playersCount;
    this.#queueKey = queueKey;
    this.#presenceCount = presenceCount;
    this.#onJoin = onJoin;
  }

  /**
   * Cria e retorna o elemento do card.
   * @returns {HTMLElement}
   */
  create() {
    const card = Dom.create('div', { classes: 'lobby-card' });

    // Título: "2 Jogadores"
    const title = Dom.create('h3', {
      classes: 'lobby-card__title',
      text: `${this.#playersCount} Jogadores`,
    });

    // Contador de presentes
    const presenceText = this.#presenceCount === 1
      ? '1 pessoa aguardando'
      : `${this.#presenceCount} pessoas aguardando`;

    const presence = Dom.create('p', {
      classes: 'lobby-card__presence',
      text: presenceText,
    });

    // Botão entrar
    const btn = Dom.create('button', {
      classes: 'lobby-card__button',
      text: 'ENTRAR NA FILA',
      attrs: { type: 'button' },
    });

    btn.addEventListener('click', () => {
      SoundManager.getInstance().play('made');
      this.#onJoin?.();
    });

    card.append(title, presence, btn);
    this.#el = card;
    return card;
  }

  /**
   * Atualiza contador de presença.
   * @param {number} count
   */
  updatePresence(count) {
    this.updateCount(count);
  }

  /**
   * Atualiza o contador de jogadores na fila (preferir este sobre updatePresence).
   * @param {number} count
   */
  updateCount(count) {
    this.#presenceCount = count;
    if (this.#el) {
      const presenceEl = this.#el.querySelector('.lobby-card__presence');
      if (presenceEl) {
        const text = count === 1 ? '1 pessoa aguardando' : `${count} pessoas aguardando`;
        presenceEl.textContent = text;
      }
    }
  }

  /**
   * Coloca o card em estado "Entrando..." (desabilita botão).
   * Chame antes de navegar para MatchRoomScreen para evitar tela vazia.
   */
  setEntering() {
    if (!this.#el) return;
    const btn = this.#el.querySelector('.lobby-card__button');
    if (btn) {
      btn.textContent = 'Entrando...';
      btn.disabled    = true;
    }
  }

  /**
   * @returns {HTMLElement|null}
   */
  getElement() {
    return this.#el;
  }
}
