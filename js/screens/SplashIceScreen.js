/**
 * @layer screens
 * @group splash
 * @role UI
 * @depends Screen, Dom, Time, GameConfig
 * @exports SplashIceScreen
 *
 * Tela de splash com fundo gelo.
 * Exibe o logo centralizado e avança por toque ou automaticamente.
 */
import { Screen }     from '../core/Screen.js';
import { Dom }        from '../utils/Dom.js';
import { Time }       from '../utils/Time.js';
import { GameConfig } from '../domain/GameConfig.js';

export class SplashIceScreen extends Screen {

  /** @type {import('../core/ScreenManager.js').ScreenManager} */
  #manager;

  /** @type {number|null} */
  #timeoutId = null;

  /** @type {Function|null} */
  #clickHandler = null;

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    super('SplashIceScreen');
    this.#manager = screenManager;
  }

  // -------------------------------------------------------
  // Template
  // -------------------------------------------------------

  _buildTemplate() {
    const wrapper = Dom.create('div', { classes: 'splash-ice' });

    const logo = Dom.create('img', {
      classes: 'splash-ice__logo',
      attrs: {
        src: 'img/carta_logo.png',
        alt: 'Deu Mico — Logo',
        draggable: 'false',
      },
    });

    const hint = Dom.create('p', {
      classes: 'splash-ice__hint',
      text: 'Toque para começar',
    });

    wrapper.appendChild(logo);
    wrapper.appendChild(hint);
    return wrapper;
  }

  // -------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------

  async onEnter() {
    // Toque/clique na tela: avança imediatamente para a próxima tela
    this.#clickHandler = () => {
      if (this.#timeoutId !== null) {
        Time.cancel(this.#timeoutId);
        this.#timeoutId = null;
      }
      this.#manager.show('SplashGreenScreen');
    };

    const el = this.getElement();
    el?.addEventListener('click',      this.#clickHandler, { once: true });
    el?.addEventListener('touchstart', this.#clickHandler, { once: true, passive: true });

    // Auto-avança após DURATION_MS sem interação
    this.#timeoutId = Time.delay(() => {
      this.#manager.show('SplashGreenScreen');
    }, GameConfig.SPLASH_ICE_DURATION);
  }

  onExit() {
    if (this.#timeoutId !== null) {
      Time.cancel(this.#timeoutId);
      this.#timeoutId = null;
    }

    if (this.#clickHandler) {
      const el = this.getElement();
      el?.removeEventListener('click',      this.#clickHandler);
      el?.removeEventListener('touchstart', this.#clickHandler);
      this.#clickHandler = null;
    }
  }
}
