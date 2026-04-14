/**
 * @layer components
 * @group game
 * @role Component
 * @depends Dom
 * @exports TournamentBadge
 *
 * Badge especial que exibe "CAMPEONATO" no topo da tela.
 * Usado apenas em modo tournament.
 */

import { Dom } from '../utils/Dom.js';

export class TournamentBadge {
  /**
   * Cria o elemento DOM do badge de campeonato.
   * @returns {HTMLElement}
   */
  create() {
    const wrapper = Dom.create('div', { classes: 'tournament-badge' });

    const textEl = Dom.create('div', { classes: 'tournament-badge__text', text: '🏆 CAMPEONATO' });
    wrapper.append(textEl);

    return wrapper;
  }
}
