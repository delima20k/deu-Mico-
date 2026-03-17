/**
 * @layer    screens
 * @group    menu
 * @role     Screen
 * @depends  Screen, AuthService, UserProfile, HeaderBar, SideMenu, Dom
 * @exports  MenuScreen
 *
 * FASE 2: Tela de menu principal com menu lateral.
 * Contém: HeaderBar fixo + SideMenu deslizante + conteúdo verde + imagem + 3 botões.
 *
 * Fluxo:
 *   1. Verifica autenticação ao entrar
 *   2. Se não autenticado → redireciona para LoginScreen
 *   3. Se autenticado → renderiza MenuScreen com SideMenu
 *   4. Hamburguer abre/fecha SideMenu com animação
 */
import { Screen } from '../core/Screen.js';
import { AuthService } from '../services/AuthService.js';
import { UserProfile } from '../domain/UserProfile.js';
import { HeaderBar } from '../components/HeaderBar.js';
import { SideMenu } from '../components/SideMenu.js';
import { Dom } from '../utils/Dom.js';
import { App } from '../core/App.js';
import { AudioService } from '../services/AudioService.js';

export class MenuScreen extends Screen {
  /** @type {import('../core/ScreenManager.js').ScreenManager} */
  #screenManager;

  /** @type {HeaderBar} */
  #headerBar;

  /** @type {SideMenu} */
  #sideMenu;

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    super('MenuScreen');
    this.#screenManager = screenManager;
    this.#headerBar     = null;
    this.#sideMenu      = null;
  }

  // -------------------------------------------------------
  // Template
  // -------------------------------------------------------

  /**
   * Cria o container vazio. Conteúdo será inserido em onEnter().
   * @returns {HTMLElement}
   */
  _buildTemplate() {
    const wrapper = Dom.create('div', { classes: 'menu-screen' });
    return wrapper;
  }

  // -------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------

  /**
   * Verifica autenticação e renderiza a tela.
   * @param {Object} [params={}] - parâmetros da navegação
   * @param {Object} [params.user] - usuário passado pelo LoginScreen (com photoURL)
   */
  async onEnter(params = {}) {
    try {
      let currentUser = params.user || null;
      const authService = AuthService.getInstance();

      // Se não houver usuário nos params, consulta Firebase
      if (!currentUser) {
        currentUser = await authService.getCurrentUser();
      }

      if (!currentUser) {
        // Redireciona para LoginScreen
        this.#screenManager.show('LoginScreen');
        return;
      }

      // Carrega perfil persistido no RTDB (/users/{uid}/profile)
      const profile = await authService.getProfile(currentUser.uid)
        .catch(err => {
          console.warn('[MenuScreen] Erro ao carregar perfil:', err);
          return null;
        });

      // 2. Renderiza a tela com o perfil
      this.#render(profile, currentUser);

      // 3. Inicia música de fundo em loop
      AudioService.getInstance().playLoop('menu-bgm');
    } catch (error) {
      console.error('[MenuScreen] Erro ao verificar autenticação:', error);
      this.#screenManager.show('LoginScreen');
    }
  }

  /**
   * Limpeza ao sair da tela.
   */
  onExit() {
    AudioService.getInstance().stopLoop('menu-bgm');
  }

  // -------------------------------------------------------
  // Renderização
  // -------------------------------------------------------

  /**
   * Renderiza todo o conteúdo da tela.
   * @private
   * @param {Object} currentUser - UserDTO do Firebase
   */
  /**
   * Renderiza todo o conteúdo da tela.
   * @private
   * @param {UserProfile|null} userProfile - perfil carregado do RTDB
   * @param {Object} [fallbackUser=null] - usuário Firebase Auth (fallback)
   */
  #render(userProfile, fallbackUser = null) {
    // Se não veio perfil do RTDB, monta mínimo a partir do Firebase Auth
    if (!userProfile) {
      const u = fallbackUser || {};
      userProfile = new UserProfile({
        uid:      u.uid   || '',
        email:    u.email || '',
        name:     u.displayName || (u.email ? u.email.split('@')[0] : 'Jogador'),
        avatarUrl: u.photoURL || null,
      });
    }

    const container = this.getElement();
    container.innerHTML = ''; // Limpa conteúdo anterior

    // ── HeaderBar fixo ─────────────────────────────────
    this.#headerBar = new HeaderBar();
    const headerEl = this.#headerBar.create();
    container.append(headerEl);

    // ── SideMenu deslizante ────────────────────────────
    this.#sideMenu = new SideMenu(userProfile);
    const sideMenuEl = this.#sideMenu.create();
    container.append(sideMenuEl);

    // Conecta hamburguer ao toggle do menu
    this.#headerBar.onToggleMenu(() => this.#sideMenu.toggle());

    // Listeners do SideMenu
    this.#sideMenu.on('salas', () => {
      console.log('[MenuScreen] Navegando para Salas');
      AudioService.getInstance().stopLoop('menu-bgm');
      this.#screenManager.show('RoomsScreen');
    });
    this.#sideMenu.on('ranking', () => {
      console.log('[MenuScreen] Navegando para Ranking');
      AudioService.getInstance().stopLoop('menu-bgm');
      // TODO: implementar em futuro
    });
    this.#sideMenu.on('campeonato', () => {
      console.log('[MenuScreen] Navegando para Campeonato');
      AudioService.getInstance().stopLoop('menu-bgm');
      this.#screenManager.show('TournamentScreen');
    });
    this.#sideMenu.on('logout', () => {
      App.markIntentionalLogout();
      this.#screenManager.show('LoginScreen');
    });

    // ── Conteúdo principal (fundo verde) ───────────────
    const main = Dom.create('main', { classes: 'menu-screen__main' });

    // Título
    const title = Dom.create('h1', {
      classes: 'menu-screen__title',
      text: 'DEU MICO!!',
    });

    // Imagem centralizada
    const image = Dom.create('img', {
      classes: 'menu-screen__image',
      attrs: {
        src: 'img/carta_home.png',
        alt: 'Deu Mico',
        draggable: 'false',
      },
    });

    // Container de botões
    const buttonsContainer = Dom.create('div', {
      classes: 'menu-screen__buttons',
    });

    // Botão 1: SALAS
    const btnSalas = Dom.create('button', {
      classes: 'menu-screen__button',
      text: 'SALAS',
    });
    Dom.on(btnSalas, 'click', () => {
      console.log('[MenuScreen] Clicado em SALAS');
      AudioService.getInstance().stopLoop('menu-bgm');
      this.#screenManager.show('RoomsScreen');
    });

    // Botão 2: CAMPEONATO
    const btnCampeonato = Dom.create('button', {
      classes: 'menu-screen__button',
      text: 'CAMPEONATO',
    });
    Dom.on(btnCampeonato, 'click', () => {
      console.log('[MenuScreen] Clicado em CAMPEONATO');
      AudioService.getInstance().stopLoop('menu-bgm');
      this.#screenManager.show('TournamentScreen');
    });

    // Botão 3: RANKING
    const btnRanking = Dom.create('button', {
      classes: 'menu-screen__button',
      text: 'RANKING',
    });
    Dom.on(btnRanking, 'click', () => {
      console.log('[MenuScreen] Clicado em RANKING');
      AudioService.getInstance().stopLoop('menu-bgm');
      // TODO: Implementar em futuro
    });

    buttonsContainer.append(btnSalas, btnCampeonato, btnRanking);

    // Container de duas imagens lado a lado
    const cardsRow = Dom.create('div', { classes: 'menu-screen__cards-row' });

    const cardsHeading = Dom.create('h2', {
      classes: 'menu-screen__cards-heading',
      text: 'Regras do Jogo',
    });

    const cardsImages = Dom.create('div', { classes: 'menu-screen__cards-images' });

    const imgRegras = Dom.create('img', {
      classes: 'menu-screen__card-img',
      attrs: {
        src: 'img/carta_regras_jogo.png',
        alt: 'Regras do Jogo',
        draggable: 'false',
      },
    });

    const imgCampeonato = Dom.create('img', {
      classes: 'menu-screen__card-img',
      attrs: {
        src: 'img/carta_conponato.png',
        alt: 'Campeonato',
        draggable: 'false',
      },
    });

    cardsImages.append(imgRegras, imgCampeonato);
    cardsRow.append(cardsHeading, cardsImages);
    main.append(title, image, buttonsContainer, cardsRow);
    container.append(main);

    console.log('[MenuScreen] Renderizado para:', userProfile.name);
  }
}

