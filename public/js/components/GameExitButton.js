/**
 * @layer    components
 * @group    game
 * @role     UI
 * @depends  Dom, SoundManager
 * @exports  GameExitButton
 *
 * Botão fixo "CORRER" para sair da mesa de jogo.
 * Posicionado no canto superior esquerdo via CSS (.game-exit-btn).
 * Exibe confirm modal antes de chamar onExitRequested.
 */
import { Dom }          from '../utils/Dom.js';
import { SoundManager } from '../utils/SoundManager.js';

export class GameExitButton {
  /** @type {() => void} */
  #onExitRequested;

  /** @type {HTMLElement|null} */
  #el = null;

  /**
   * @param {Object} options
   * @param {() => void} options.onExitRequested - callback chamado após confirmação
   */
  constructor({ onExitRequested }) {
    this.#onExitRequested = onExitRequested;
  }

  /**
   * Cria e retorna o elemento do botão.
   * @returns {HTMLElement}
   */
  create() {
    const btn = Dom.create('button', {
      classes: 'game-exit-btn',
      attrs: { type: 'button', title: 'Sair da partida' },
    });
    btn.textContent = '🏃 CORRER';

    btn.addEventListener('click', () => this.#handleClick());

    this.#el = btn;
    return btn;
  }

  /**
   * @private
   */
  #handleClick() {
    SoundManager.getInstance().play('made');

    // confirm nativo — leve, sem dependência extra
    const confirmed = window.confirm('Deseja sair da partida?');
    if (!confirmed) return;

    this.#onExitRequested?.();
  }

  /** @returns {HTMLElement|null} */
  getElement() { return this.#el; }
}
