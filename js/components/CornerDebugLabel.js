/**
 * @layer    components
 * @group    game-debug
 * @role     Debug
 * @depends  Dom
 * @exports  CornerDebugLabel
 *
 * Marcação visual de debug para as quinas do hexágono.
 * Exibe um badge numerado/literado em uma das 6 posições do hexágono.
 *
 * Usado exclusivamente durante o desenvolvimento para validar:
 *  - posicionamento das quinas do hexágono
 *  - layout da mesa hexagonal
 *  - posicionamento futuro dos jogadores
 */

import { Dom } from '../utils/Dom.js';

/*
 * DEBUG CORNER LABELS
 * These labels are used only during development
 * to identify hexagon corners.
 *
 * REMOVE BEFORE PRODUCTION
 */

export class CornerDebugLabel {
  /** @type {string} Texto exibido no badge (ex: "1", "A") */
  #text;

  /**
   * Chave de posição no hexágono.
   * Valores aceitos: 'top-left' | 'top-right' | 'right' | 'bottom-right' | 'bottom-left' | 'left'
   * @type {string}
   */
  #positionKey;

  /**
   * @param {string} text        - Texto do badge (ex: "1", "A")
   * @param {string} positionKey - Posição no hexágono
   */
  constructor(text, positionKey) {
    this.#text        = text;
    this.#positionKey = positionKey;
  }

  /**
   * Cria e retorna o elemento de debug.
   * @returns {HTMLElement}
   */
  create() {
    const el = Dom.create('span', {
      classes: [
        'hex-table__corner-label',
        `hex-table__corner-label--${this.#positionKey}`,
      ],
      text: this.#text,
      attrs: {
        'aria-hidden': 'true',
        'data-corner': this.#positionKey,
        title: `Corner: ${this.#positionKey}`,
      },
    });

    return el;
  }
}
