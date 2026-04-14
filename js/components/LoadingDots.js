/**
 * @layer components
 * @group animation
 * @role UI
 * @depends Dom
 * @exports LoadingDots
 *
 * Componente reutilizável que renderiza três pontos saltantes (bouncing dots).
 * Usado como indicador de carregamento durante animações de splash.
 */
import { Dom } from '../utils/Dom.js';

export class LoadingDots {
  /** @type {number} */
  #count;

  /** @type {string} */
  #containerClass;

  /** @type {HTMLElement|null} */
  #element = null;

  /**
   * @param {Object} [options]
   * @param {number} [options.count=3]
   * @param {string} [options.containerClass='loading-dots']
   */
  constructor({ count = 3, containerClass = 'loading-dots' } = {}) {
    this.#count          = count;
    this.#containerClass = containerClass;
  }

  // -------------------------------------------------------
  // Criação
  // -------------------------------------------------------

  /**
   * Cria e retorna o elemento DOM com os pontos.
   * @returns {HTMLElement}
   */
  create() {
    this.#element = Dom.create('div', {
      classes: this.#containerClass,
      attrs: { 'aria-label': 'Carregando', role: 'status' },
    });

    for (let i = 0; i < this.#count; i++) {
      const dot = Dom.create('span', {
        classes: 'loading-dots__dot',
        attrs:   { 'aria-hidden': 'true' },
      });
      this.#element.appendChild(dot);
    }

    return this.#element;
  }

  // -------------------------------------------------------
  // Controle
  // -------------------------------------------------------

  /** Exibe os pontos. */
  show() {
    if (this.#element) this.#element.style.display = 'flex';
  }

  /** Oculta os pontos. */
  hide() {
    if (this.#element) this.#element.style.display = 'none';
  }

  /** Remove do DOM e libera referência. */
  destroy() {
    this.#element?.remove();
    this.#element = null;
  }

  /** @returns {HTMLElement|null} */
  getElement() { return this.#element; }
}
