/**
 * @layer    screens
 * @group    home
 * @role     UI
 * @depends  Screen, Dom, Footer
 * @exports  HomeScreen
 *
 * Tela principal: sem header, conteúdo centralizado.
 * Hero image em destaque, H1 grande, descrição e botão.
 * Footer com logos de marca e app stores.
 */
import { Screen }      from '../core/Screen.js';
import { Dom }         from '../utils/Dom.js';
import { Footer }      from '../components/Footer.js';
import { AuthService } from '../services/AuthService.js';

export class HomeScreen extends Screen {
  /** @type {import('../core/ScreenManager.js').ScreenManager} */
  #manager;

  /** @type {Function[]} */
  #cleanups = [];

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    super('HomeScreen');
    this.#manager = screenManager;
  }

  // -------------------------------------------------------
  // Template
  // -------------------------------------------------------

  _buildTemplate() {
    const wrapper = Dom.create('div', { classes: 'home-screen' });

    // ── Conteúdo central ──────────────────────────────────
    const body = Dom.create('div', { classes: 'home-body' });

    // Badge de usuário (flutuante, oculto por padrão)
    const badge = Dom.create('span', {
      classes: ['home-badge', 'home-badge--hidden'],
      attrs: { id: 'home-user-badge' },
    });

    // ── Linha de topo: logo + H1 ──────────────────────────
    const headRow = Dom.create('div', { classes: 'home-headrow' });

    const logoImg = Dom.create('img', {
      classes: 'home-headrow__logo',
      attrs: {
        src:       'img/carta_logo.png',
        alt:       'Deu Mico logo',
        draggable: 'false',
      },
    });

    const title = Dom.create('h1', {
      classes: 'home-title',
      text:    'DEU MICO',
    });

    headRow.append(logoImg, title);

    // ── Imagem hero ───────────────────────────────────────
    const heroImg = Dom.create('img', {
      classes: 'home-hero',
      attrs: {
        src:       'img/carta_home.png',
        alt:       'Cartas do jogo Deu Mico',
        draggable: 'false',
      },
    });

    // ── Card branco: descrição + botão ────────────────────
    const card = Dom.create('div', { classes: 'home-card' });

    const desc = Dom.create('p', {
      classes: 'home-desc',
      text:    'Recomendado a partir de 6 anos. Um jogo leve e engraçado para reunir a família e os amigos!',
    });

    const playBtn = Dom.create('button', {
      classes: 'home-btn',
      text:    'DIVIRTA-SE!',
      attrs:   { type: 'button' },
    });

    card.append(desc, playBtn);
    body.append(badge, headRow, heroImg, card);
    wrapper.appendChild(body);

    // ── Footer com logos ──────────────────────────────────
    const footer = new Footer();
    wrapper.appendChild(footer.create());

    // ── Eventos ────────────────────────────────────────────
    // Verifica estado de autenticação no momento do clique:
    // - Se já logado → vai direto ao MenuScreen (evita form de login desnecessário)
    // - Se não logado → vai ao LoginScreen
    const offPlay = Dom.on(playBtn, 'click', async () => {
      try {
        const user = await AuthService.getInstance().getCurrentUser();
        if (user) {
          this.#manager.show('MenuScreen', { user });
        } else {
          this.#manager.show('LoginScreen');
        }
      } catch (_) {
        this.#manager.show('LoginScreen');
      }
    });
    this.#cleanups.push(offPlay);

    return wrapper;
  }

  // -------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------

  onEnter(params = {}) {
    if (params.user) {
      this.#showUserBadge(params.user);
    }
  }

  onExit() {
    this.#cleanups.forEach(fn => fn());
    this.#cleanups = [];
  }

  // -------------------------------------------------------
  // Privado
  // -------------------------------------------------------

  /**
   * Exibe o badge de usuário logado (flutuante no topo).
   * @param {{ displayName?: string, email: string }} user
   */
  #showUserBadge(user) {
    const badge = this.getElement()?.querySelector('#home-user-badge');
    if (!badge) return;
    badge.textContent = `👤 ${user.displayName || user.email}`;
    badge.classList.remove('home-badge--hidden');
  }
}
