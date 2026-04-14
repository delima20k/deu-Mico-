/**
 * @layer components
 * @group game
 * @role Component
 * @depends Dom
 * @exports CardsHandView
 *
 * Placeholder da mão de cartas do jogador (embaixo da tela).
 * Fase 2: exibe apenas container. Fase 3+: renderizará cartas reais.
 */

import { Dom } from '../utils/Dom.js';

export class CardsHandView {
  /** @type {number} Quantidade de cartas na mão */
  #cardCount;

  /**
   * @param {number} [cardCount=0]
   */
  constructor(cardCount = 0) {
    this.#cardCount = cardCount;
  }

  /**
   * Cria o elemento DOM da mão de cartas.
   * @returns {HTMLElement}
   */
  create() {
    const wrapper = Dom.create('div', { classes: 'cards-hand-view' });

    const labelsEl = Dom.create('div', { classes: 'cards-hand-view__labels' });
    
    const titleEl = Dom.create('span', {
      classes: 'cards-hand-view__title',
      text: 'Sua Mão'
    });
    
    const countEl = Dom.create('span', {
      classes: 'cards-hand-view__count',
      text: `${this.#cardCount} cartas`
    });
    
    labelsEl.append(titleEl, countEl);
    wrapper.append(labelsEl);

    return wrapper;
  }
}
