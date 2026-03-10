/**
 * @layer components
 * @group game
 * @role Component
 * @depends Dom
 * @exports TableBackground
 *
 * Componente que renderiza o plano de fundo da mesa:
 * fundo verde e área central de jogo (retângulo com borda).
 */

import { Dom } from '../utils/Dom.js';

export class TableBackground {
  /**
   * Cria o elemento DOM de fundo.
   * @returns {HTMLElement}
   */
  create() {
    const wrapper = Dom.create('div', { classes: 'table-background' });

    // Área central de jogo (neste projeto pode ser o centro onde vai disco central)
    const gameArea = Dom.create('div', { classes: 'table-background__game-area' });
    wrapper.append(gameArea);

    return wrapper;
  }
}
