/**
 * @layer components
 * @group lobby
 * @role UI
 * @depends Dom
 * @exports QueueStatusBar
 *
 * Barra de status para fila/sala multijogador.
 * Exibe: jogadores atuais/mínimo, botão sair, countdown se >=2.
 */
import { Dom } from '../utils/Dom.js';

export class QueueStatusBar {
  /** @type {string} */
  #queueKey;

  /** @type {number} */
  #minPlayers;

  /** @type {number} */
  #currentPlayers = 0;

  /** @type {Function|null} */
  #onLeave = null;

  /** @type {HTMLElement|null} */
  #el = null;

  /** @type {number|null} */
  #countdownId = null;

  /** @type {number} */
  #countdownSeconds = 10;

  /**
   * @param {Object} options
   * @param {string} options.queueKey
   * @param {number} options.minPlayers - mínimo para iniciar
   * @param {number} [options.currentPlayers=0]
   * @param {Function} [options.onLeave] - callback ao sair
   */
  constructor({ queueKey, minPlayers, currentPlayers = 0, onLeave = null }) {
    this.#queueKey = queueKey;
    this.#minPlayers = minPlayers;
    this.#currentPlayers = currentPlayers;
    this.#onLeave = onLeave;
  }

  /**
   * Cria e retorna o elemento da barra.
   * @returns {HTMLElement}
   */
  create() {
    const bar = Dom.create('div', { classes: 'queue-status-bar' });

    // Status text
    const statusText = Dom.create('p', {
      classes: 'queue-status-bar__text',
      text: `${this.#currentPlayers}/${this.#minPlayers} jogadores`,
    });

    // Countdown (visível se >= 2 jogadores)
    const countdownEl = Dom.create('span', {
      classes: ['queue-status-bar__countdown', 'queue-status-bar__countdown--hidden'],
      text: `Iniciando em 10s...`,
    });

    // Botão sair
    const btnLeave = Dom.create('button', {
      classes: 'queue-status-bar__leave-btn',
      text: 'SAIR',
      attrs: { type: 'button' },
    });

    btnLeave.addEventListener('click', () => {
      this.#onLeave?.();
    });

    bar.append(statusText, countdownEl, btnLeave);
    this.#el = bar;
    return bar;
  }

  /**
   * Atualiza contador de jogadores.
   * @param {number} count
   */
  updateCount(count) {
    this.#currentPlayers = count;
    if (this.#el) {
      const textEl = this.#el.querySelector('.queue-status-bar__text');
      if (textEl) {
        textEl.textContent = `${count}/${this.#minPlayers} jogadores`;
      }

      // Se >= 2, mostra countdown
      if (count >= 2 && this.#countdownId === null) {
        this.#startCountdown();
      }
    }
  }

  /**
   * Inicia countdown de 10 segundos.
   * @private
   */
  #startCountdown() {
    const countdownEl = this.#el?.querySelector('.queue-status-bar__countdown');
    if (!countdownEl) return;

    this.#countdownSeconds = 10;
    countdownEl.classList.remove('queue-status-bar__countdown--hidden');

    this.#countdownId = setInterval(() => {
      this.#countdownSeconds--;
      countdownEl.textContent = `Iniciando em ${this.#countdownSeconds}s...`;

      if (this.#countdownSeconds <= 0) {
        clearInterval(this.#countdownId);
        this.#countdownId = null;
        countdownEl.classList.add('queue-status-bar__countdown--hidden');
      }
    }, 1000);
  }

  /**
   * Para o countdown.
   */
  stopCountdown() {
    if (this.#countdownId !== null) {
      clearInterval(this.#countdownId);
      this.#countdownId = null;
    }
    const countdownEl = this.#el?.querySelector('.queue-status-bar__countdown');
    if (countdownEl) {
      countdownEl.classList.add('queue-status-bar__countdown--hidden');
    }
  }

  /**
   * @returns {HTMLElement|null}
   */
  getElement() {
    return this.#el;
  }
}
