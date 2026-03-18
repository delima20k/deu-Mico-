/**
 * @layer    components
 * @group    menu
 * @role     UI
 * @depends  Dom
 * @exports  HeaderBar
 *
 * Barra de cabeçalho fixa no topo.
 * Exibe logo, título e botão hamburger para abrir menu lateral.
 */
import { Dom } from '../utils/Dom.js';

export class HeaderBar {
  /** @type {HTMLElement} */
  #el;

  /** @type {HTMLElement} */
  #hamburger;

  /** @type {Function|null} */
  #onToggleMenu;

  constructor() {
    this.#el            = null;
    this.#hamburger     = null;
    this.#onToggleMenu  = null;
  }

  // -------------------------------------------------------
  // Montagem
  // -------------------------------------------------------

  /**
   * Cria e retorna o elemento da barra de cabeçalho.
   * @returns {HTMLElement}
   */
  create() {
    const header = Dom.create('header', { classes: 'header-bar' });

    // Logo
    const logo = Dom.create('img', {
      classes: 'header-bar__logo',
      attrs: {
        src: 'img/logoMarca.png',
        alt: 'Logo Deu Mico',
        draggable: 'false',
      },
    });

    // Título
    const title = Dom.create('h1', {
      classes: 'header-bar__title',
      text: 'Mico Online',
    });

    // Hamburger (3 linhas)
    const hamburger = Dom.create('button', {
      classes: 'header-bar__hamburger',
      attrs: {
        type: 'button',
        'aria-label': 'Abrir menu',
      },
    });

    // 3 linhas do hamburger
    for (let i = 0; i < 3; i++) {
      const line = Dom.create('span', { classes: 'header-bar__hamburger-line' });
      hamburger.append(line);
    }

    hamburger.addEventListener('click', () => {
      this.#onToggleMenu?.();
    });

    header.append(logo, title, hamburger);

    this.#el        = header;
    this.#hamburger = hamburger;

    return header;
  }

  /**
   * Define callback para quando ham burger é clicado.
   * @param {Function} cb
   */
  onToggleMenu(cb) {
    this.#onToggleMenu = cb;
  }

  /**
   * Atualiza o estado do hamburger (aberto/fechado).
   * @param {boolean} isOpen
   */
  setMenuOpen(isOpen) {
    if (this.#hamburger) {
      this.#hamburger.classList.toggle('is-open', isOpen);
    }
  }

  /**
   * @returns {HTMLElement|null}
   */
  getElement() {
    return this.#el;
  }
}
