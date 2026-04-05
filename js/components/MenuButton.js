/**
 * @layer    components
 * @group    menu
 * @role     UI
 * @depends  Dom, AudioService
 * @exports  MenuButton
 *
 * Componente reutilizável de botão com som.
 * Toca 'menu_click' via AudioService ao ser clicado.
 */
import { Dom }            from '../utils/Dom.js';
import { AudioService }   from '../services/AudioService.js';

export class MenuButton {
  /** @type {HTMLElement} */
  #el;

  /** @type {AudioService} */
  #audio;

  /** @type {Function} para remover listener */
  #offClick;

  /**
   * @param {Object} options
   * @param {string} options.text - texto do botão
   * @param {Function} options.onClick - callback ao clicar
   * @param {string} [options.class=''] - classe CSS adicional
   */
  constructor({ text, onClick, class: extraClass = '' }) {
    this.#audio = AudioService.getInstance();

    this.#el = Dom.create('button', {
      classes: ['menu-btn', extraClass],
      text,
      attrs: { type: 'button' },
    });

    // Som tratado globalmente pelo ButtonSoundBinder (event delegation).
    // O AudioService permanece injetado para uso futuro se necessário.
    this.#offClick = Dom.on(this.#el, 'click', () => {
      onClick?.();
    });
  }

  // -------------------------------------------------------
  // Getters
  // -------------------------------------------------------

  /**
   * @returns {HTMLElement}
   */
  getElement() {
    return this.#el;
  }

  /**
   * Remove listener (limpeza)
   */
  destroy() {
    this.#offClick?.();
  }
}
