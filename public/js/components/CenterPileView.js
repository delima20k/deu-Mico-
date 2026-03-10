/**
 * @layer components
 * @group game
 * @role Component
 * @depends Dom
 * @exports CenterPileView
 *
 * Placeholder do monte central da mesa.
 * Fase 2: exibe apenas label. Fase 3+: mostra carta superior do monte.
 */

import { Dom } from '../utils/Dom.js';

export class CenterPileView {
  /** @type {number} Quantidade de cartas no monte */
  #cardCount;

  /**
   * @param {number} [cardCount=0]
   */
  constructor(cardCount = 0) {
    this.#cardCount = cardCount;
  }

  /**
   * Cria o elemento DOM do monte central.
   * @returns {HTMLElement}
   */
  create() {
    const wrapper = Dom.create('div', { classes: 'center-pile-view' });

    // Icone/label do monte
    const labelEl = Dom.create('div', { classes: 'center-pile-view__label' });
    labelEl.innerHTML = '🂠'; // Unicode card symbol (placeholder)

    wrapper.append(labelEl);

    // Info de quantidade
    const countEl = Dom.create('div', {
      classes: 'center-pile-view__count',
      text: `${this.#cardCount}`
    });
    wrapper.append(countEl);

    return wrapper;
  }
}
