/**
 * @layer    screens
 * @group    auth
 * @role     UI
 * @depends  Screen, Dom, AuthService
 * @exports  LoginScreen
 *
 * Tela de login: fundo verde, coluna centralizada, email/senha + Google.
 * Navega para RegisterScreen via ScreenManager (SPA — sem recarregar).
 * Exibe mensagem amigável se Firebase não estiver configurado.
 */
import { Screen }      from '../core/Screen.js';
import { Dom }         from '../utils/Dom.js';
import { AuthService } from '../services/AuthService.js';

export class LoginScreen extends Screen {
  /** @type {import('../core/ScreenManager.js').ScreenManager} */
  #manager;

  /** @type {Function[]} */
  #cleanups = [];

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    super('LoginScreen');
    this.#manager = screenManager;
  }

  // ─────────────────────────────────────────────────────────
  // Template
  // ─────────────────────────────────────────────────────────

  _buildTemplate() {
    // ── Página (fundo verde) ──────────────────────────────
    const page      = Dom.create('div', { classes: 'auth-page' });
    const container = Dom.create('div', { classes: 'auth-container' });

    // ── Logo ──────────────────────────────────────────────
    const logo = Dom.create('img', {
      classes: 'auth-logo',
      attrs: {
        src:       'img/carta_logo.png',
        alt:       'Deu Mico',
        draggable: 'false',
      },
    });

    // ── Textos ────────────────────────────────────────────
    const title    = Dom.create('h1', { classes: 'auth-title',    text: 'Bem-Vindo!' });
    const subtitle = Dom.create('p',  { classes: 'auth-subtitle', text: 'Faça login para continuar' });

    // ── Feedback ──────────────────────────────────────────
    const feedback = Dom.create('p', {
      classes: ['auth-feedback', 'auth-feedback--hidden'],
      attrs: { role: 'alert', 'aria-live': 'polite' },
    });

    // ── Inputs ────────────────────────────────────────────
    const emailInput = Dom.create('input', {
      classes: 'auth-input',
      attrs: {
        type:         'email',
        placeholder:  'E-mail',
        autocomplete: 'email',
        id:           'login-email',
        'aria-label': 'E-mail',
      },
    });

    const passInput = Dom.create('input', {
      classes: 'auth-input',
      attrs: {
        type:         'password',
        placeholder:  'Senha',
        autocomplete: 'current-password',
        id:           'login-pass',
        'aria-label': 'Senha',
      },
    });

    // ── Botão principal ───────────────────────────────────
    const btnEnter = Dom.create('button', {
      classes: 'btn-primary',
      text:    'ENTRAR',
      attrs:   { type: 'button' },
    });

    // ── Divisor ───────────────────────────────────────────
    const divider = this.#buildDivider();

    // ── Botão Google ──────────────────────────────────────
    const btnGoogle = Dom.create('button', {
      classes: 'btn-google',
      attrs:   { type: 'button' },
    });
    btnGoogle.innerHTML = `
      <svg class="btn-google__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Entrar com o Google`;

    // ── Footer ────────────────────────────────────────────
    const footer = Dom.create('p', { classes: 'auth-footer' });
    footer.textContent = 'Não tem conta? ';
    const linkRegister = Dom.create('span', {
      classes: 'auth-footer-link',
      text:    'Cadastre-se',
      attrs:   { role: 'button', tabindex: '0' },
    });
    footer.appendChild(linkRegister);

    // ── Montagem ──────────────────────────────────────────
    container.append(
      logo, title, subtitle, feedback,
      emailInput, passInput,
      btnEnter, divider, btnGoogle, footer,
    );
    page.appendChild(container);

    // ── Helpers de UI ─────────────────────────────────────
    const showFeedback = (msg, isError = true) => {
      feedback.textContent = msg;
      feedback.classList.remove('auth-feedback--hidden');
      feedback.classList.toggle('auth-feedback--error',   isError);
      feedback.classList.toggle('auth-feedback--success', !isError);
    };

    const setLoading = (on) => {
      [btnEnter, btnGoogle].forEach(b => {
        b.disabled = on;
        b.classList.toggle('btn--loading', on);
      });
    };

    // ── Eventos ───────────────────────────────────────────

    const offEnter = Dom.on(btnEnter, 'click', async () => {
      const email = emailInput.value.trim();
      const pass  = passInput.value;
      if (!this.#validateLogin(email, pass, showFeedback)) return;
      setLoading(true);
      try {
        const user = await AuthService.getInstance().signIn(email, pass);
        // Garante que o perfil existe no RTDB (cria default se necessário)
        await AuthService.getInstance().ensureProfile(user)
          .catch(err => console.warn('[LoginScreen] Erro ao garantir perfil:', err));
        this.#onSuccess(user);
      } catch (err) {
        showFeedback(this.#friendlyError(err));
      } finally {
        setLoading(false);
      }
    });

    const offGoogle = Dom.on(btnGoogle, 'click', async () => {
      setLoading(true);
      try {
        const user = await AuthService.getInstance().signInWithGoogle();
        // Garante que o perfil existe no RTDB (cria default se necessário)
        await AuthService.getInstance().ensureProfile(user)
          .catch(err => console.warn('[LoginScreen] Erro ao garantir perfil Google:', err));
        this.#onSuccess(user);
      } catch (err) {
        showFeedback(this.#friendlyError(err));
      } finally {
        setLoading(false);
      }
    });

    const offRegister = Dom.on(linkRegister, 'click', () => {
      this.#manager.show('RegisterScreen');
    });

    // Acessibilidade: Enter no link
    const offRegisterKey = Dom.on(linkRegister, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.#manager.show('RegisterScreen');
    });

    // Enter entre inputs
    const offKeyEmail = Dom.on(emailInput, 'keydown', (e) => { if (e.key === 'Enter') passInput.focus(); });
    const offKeyPass  = Dom.on(passInput,  'keydown', (e) => { if (e.key === 'Enter') btnEnter.click(); });

    this.#cleanups.push(
      offEnter, offGoogle, offRegister, offRegisterKey, offKeyEmail, offKeyPass,
    );

    return page;
  }

  // ─────────────────────────────────────────────────────────
  // Ciclo de vida
  // ─────────────────────────────────────────────────────────

  onExit() {
    this.#cleanups.forEach(fn => fn());
    this.#cleanups = [];
  }

  // ─────────────────────────────────────────────────────────
  // Privado
  // ─────────────────────────────────────────────────────────

  /** Cria o divisor "── ou ──" */
  #buildDivider() {
    const divider = Dom.create('div',  { classes: 'auth-divider' });
    const line1   = Dom.create('span', { classes: 'auth-divider__line' });
    const text    = Dom.create('span', { classes: 'auth-divider__text', text: 'ou' });
    const line2   = Dom.create('span', { classes: 'auth-divider__line' });
    divider.append(line1, text, line2);
    return divider;
  }

  /** Navega para MenuScreen passando o usuário logado */
  #onSuccess(user) {
    this.#manager.show('MenuScreen', { user });
  }

  /**
   * Validação client-side para login.
   * @returns {boolean}
   */
  #validateLogin(email, pass, showFeedback) {
    if (!email || !email.includes('@')) {
      showFeedback('Informe um e-mail válido.');
      return false;
    }
    if (!pass || pass.length < 6) {
      showFeedback('A senha deve ter pelo menos 6 caracteres.');
      return false;
    }
    return true;
  }

  /**
   * Transforma erros do Firebase em mensagens amigáveis.
   * @param {Error} err
   * @returns {string}
   */
  #friendlyError(err) {
    const map = {
      'auth/not-configured':         '⚙️ Firebase não configurado. Preencha firebaseConfig.js.',
      'auth/user-not-found':         'Usuário não encontrado.',
      'auth/wrong-password':         'Senha incorreta.',
      'auth/invalid-credential':     'E-mail ou senha incorretos.',
      'auth/email-already-in-use':   'Este e-mail já está cadastrado.',
      'auth/invalid-email':          'E-mail inválido.',
      'auth/weak-password':          'Senha fraca. Use ao menos 6 caracteres.',
      'auth/popup-closed-by-user':   'Login com Google cancelado.',
      'auth/network-request-failed': 'Sem conexão. Verifique sua internet.',
      'auth/too-many-requests':      'Muitas tentativas. Aguarde e tente novamente.',
    };
    return map[err?.code] ?? (err?.message ? `Erro: ${err.message}` : 'Ocorreu um erro inesperado.');
  }
}
