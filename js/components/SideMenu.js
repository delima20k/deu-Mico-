/**
 * @layer    components
 * @group    menu
 * @role     UI
 * @depends  Dom, ProfileHeader, AvatarUploader, AuthService
 * @exports  SideMenu
 *
 * Menu lateral deslizante.
 * - Abre da esquerda com translateX(-100% → 0)
 * - Overlay escuro no fundo
 * - Transição suave 300ms
 * - Respeita prefers-reduced-motion
 *
 * Conteúdo:
 *   1. ProfileHeader (avatar + nome + idade)
 *   2. AvatarUploader (selecionar imagem)
 *   3. Menu items (Salas, Ranking, Campeonato, Sair)
 *   4. Overlay (fechar ao clicar)
 */
import { Dom } from '../utils/Dom.js';
import { ProfileHeader } from './ProfileHeader.js';
import { AvatarUploader } from './AvatarUploader.js';
import { AuthService } from '../services/AuthService.js';

export class SideMenu {
  /** @type {import('../domain/UserProfile.js').UserProfile} */
  #profile;

  /** @type {ProfileHeader} */
  #profileHeader;

  /** @type {AvatarUploader} */
  #avatarUploader;

  /** @type {HTMLElement} */
  #el;

  /** @type {HTMLElement} */
  #overlay;

  /** @type {boolean} */
  #isOpen;

  /** @type {Object<string, Function[]>} */
  #listeners;

  /**
   * @param {import('../domain/UserProfile.js').UserProfile} profile
   */
  constructor(profile) {
    this.#profile        = profile;
    this.#profileHeader  = new ProfileHeader(profile);
    this.#avatarUploader = new AvatarUploader({
      uid: profile.uid,
      onUpload: (dataUrl) => this.#profileHeader.updateAvatar(dataUrl),
    });
    this.#el      = null;
    this.#overlay = null;
    this.#isOpen  = false;
    this.#listeners = {};
  }

  /**
   * Cria e retorna o elemento HTML do menu lateral.
   * @returns {HTMLElement}
   */
  create() {
    // Container do menu (será posicionado fora da tela inicialmente)
    const menu = Dom.create('aside', { classes: 'side-menu' });

    // Grupo: Perfil + uploader
    const profileSection = Dom.create('div', {
      classes: 'side-menu__profile',
    });
    profileSection.append(this.#profileHeader.create());
    profileSection.append(this.#avatarUploader.create());

    // Separador
    const separator = Dom.create('div', { classes: 'side-menu__separator' });

    // Grupo: Itens de navegação
    const itemsSection = Dom.create('nav', {
      classes: 'side-menu__nav',
    });

    // Item: Salas
    const itemSalas = this.#createMenuItem('Salas', () => {
      this.close();
      this.#emit('salas');
    });

    // Item: Ranking
    const itemRanking = this.#createMenuItem('Ranking', () => {
      this.close();
      this.#emit('ranking');
    });

    // Item: Campeonato
    const itemCampeonato = this.#createMenuItem('Campeonato', () => {
      this.close();
      this.#emit('campeonato');
    });

    // Separador
    const separatorBottom = Dom.create('div', {
      classes: 'side-menu__separator',
    });

    // Item: Sair (logout)
    const itemLogout = this.#createMenuItem('Sair', async () => {
      this.close();
      try {
        const authService = AuthService.getInstance();
        await authService.logout();
        this.#emit('logout');
      } catch (err) {
        console.error('[SideMenu] Erro ao fazer logout:', err);
      }
    });

    itemsSection.append(
      itemSalas,
      itemRanking,
      itemCampeonato,
      separatorBottom,
      itemLogout
    );

    menu.append(profileSection, separator, itemsSection);
    this.#el = menu;

    // Overlay (fecha menu ao clicar)
    this.#overlay = Dom.create('div', {
      classes: 'side-menu__overlay',
    });
    this.#overlay.addEventListener('click', () => this.close());

    return menu;
  }

  /**
   * Cria um item de menu único.
   * @private
   * @param {string} text
   * @param {Function} onClick
   * @returns {HTMLElement}
   */
  #createMenuItem(text, onClick) {
    const item = Dom.create('button', {
      classes: 'side-menu__item',
      text: text,
      attrs: {
        type: 'button',
      },
    });

    item.addEventListener('click', onClick);
    return item;
  }

  /**
   * Emite evento customizado.
   * @private
   * @param {string} eventName
   */
  #emit(eventName) {
    if (this.#listeners[eventName]) {
      this.#listeners[eventName].forEach(cb => cb());
    }
  }

  /**
   * Registra listener para evento (salas, ranking, campeonato, logout).
   * @param {string} eventName
   * @param {Function} callback
   */
  on(eventName, callback) {
    if (!this.#listeners[eventName]) {
      this.#listeners[eventName] = [];
    }
    this.#listeners[eventName].push(callback);
  }

  /**
   * Abre o menu lateral com animação.
   */
  open() {
    if (this.#isOpen || !this.#el) return;

    this.#isOpen = true;
    this.#el.classList.add('is-open');

    // Insere overlay no DOM
    if (this.#overlay && this.#el.parentElement) {
      this.#el.parentElement.insertBefore(
        this.#overlay,
        this.#el
      );
    }
  }

  /**
   * Fecha o menu lateral com animação.
   */
  close() {
    if (!this.#isOpen || !this.#el) return;

    this.#isOpen = false;
    this.#el.classList.remove('is-open');

    // Remove overlay
    if (this.#overlay && this.#overlay.parentElement) {
      this.#overlay.parentElement.removeChild(this.#overlay);
    }
  }

  /**
   * Alterna menu aberto/fechado.
   */
  toggle() {
    if (this.#isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * @returns {boolean}
   */
  isOpen() {
    return this.#isOpen;
  }

  /**
   * @returns {HTMLElement|null}
   */
  getElement() {
    return this.#el;
  }

  /**
   * @returns {HTMLElement|null}
   */
  getOverlay() {
    return this.#overlay;
  }
}
