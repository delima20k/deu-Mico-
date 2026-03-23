/**
 * @layer    screens
 * @group    auth
 * @role     UI
 * @depends  Screen, Dom, AuthService, Validator
 * @exports  RegisterScreen
 *
 * Tela de cadastro: fundo verde, coluna centralizada.
 * Fluxo: Email + Senha + Confirmar Senha + Idade (email/senha) e botão Google.
 * Navega para LoginScreen via ScreenManager (SPA — sem recarregar).
 * Exibe mensagem amigável se Firebase não estiver configurado.
 */
import { Screen }      from '../core/Screen.js';
import { Dom }         from '../utils/Dom.js';
import { AuthService } from '../services/AuthService.js';
import { Validator }   from '../utils/Validator.js';

export class RegisterScreen extends Screen {
  /** @type {import('../core/ScreenManager.js').ScreenManager} */
  #manager;

  /** @type {Function[]} */
  #cleanups = [];

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    super('RegisterScreen');
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
    const title    = Dom.create('h1', { classes: 'auth-title',    text: 'Criar Conta' });
    const subtitle = Dom.create('p',  { classes: 'auth-subtitle', text: 'Cadastre-se para continuar' });

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
        id:           'register-email',
        'aria-label': 'E-mail',
      },
    });

    const passInput = Dom.create('input', {
      classes: 'auth-input',
      attrs: {
        type:         'password',
        placeholder:  'Senha (mín. 6 caracteres)',
        autocomplete: 'new-password',
        id:           'register-pass',
        'aria-label': 'Senha',
      },
    });

    const confirmInput = Dom.create('input', {
      classes: 'auth-input',
      attrs: {
        type:         'password',
        placeholder:  'Confirmar senha',
        autocomplete: 'new-password',
        id:           'register-confirm',
        'aria-label': 'Confirmar senha',
      },
    });

    const ageInput = Dom.create('input', {
      classes: 'auth-input',
      attrs: {
        type:         'number',
        placeholder:  'Idade (6-120)',
        min:          '6',
        max:          '120',
        id:           'register-age',
        'aria-label': 'Idade',
      },
    });

    // ── Botão principal ───────────────────────────────────
    const btnCadastrar = Dom.create('button', {
      classes: 'btn-primary',
      text:    'CADASTRAR',
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
      Cadastrar com Google`;

    // ── Footer ────────────────────────────────────────────
    const footer = Dom.create('p', { classes: 'auth-footer' });
    footer.textContent = 'Já tem conta? ';
    const linkLogin = Dom.create('span', {
      classes: 'auth-footer-link',
      text:    'Entrar',
      attrs:   { role: 'button', tabindex: '0' },
    });
    footer.appendChild(linkLogin);

    // ── Montagem ──────────────────────────────────────────
    container.append(
      logo, title, subtitle, feedback,
      emailInput, passInput, confirmInput, ageInput,
      btnCadastrar, divider, btnGoogle, footer,
    );
    page.appendChild(container);

    // ── Helpers de UI ─────────────────────────────────────
    const showFeedback = (msg, isError = true) => {
      feedback.textContent = msg;
      feedback.classList.remove('auth-feedback--hidden');
      feedback.classList.toggle('auth-feedback--error',   isError);
      feedback.classList.toggle('auth-feedback--success', !isError);
    };

    const hideFeedback = () => {
      feedback.classList.add('auth-feedback--hidden');
    };

    const setLoading = (on) => {
      [btnCadastrar, btnGoogle].forEach(b => {
        b.disabled = on;
        b.classList.toggle('btn--loading', on);
      });
    };

    // ── Eventos ───────────────────────────────────────────

    const offCadastrar = Dom.on(btnCadastrar, 'click', async () => {
      hideFeedback();
      const email   = emailInput.value.trim();
      const pass    = passInput.value;
      const confirm = confirmInput.value;
      const age     = parseInt(ageInput.value, 10);
      if (!this.#validate(email, pass, confirm, age, showFeedback)) return;
      setLoading(true);
      try {
        const user = await AuthService.getInstance().signUp(email, pass);
        // Salva perfil no RTDB com nome e idade reais
        await AuthService.getInstance().ensureProfile(user, {
          name: user.displayName || user.email?.split('@')[0] || 'Jogador',
          age,
          avatarUrl: user.photoURL || null,
        }).catch(err => console.warn('[RegisterScreen] Erro ao salvar perfil:', err));
        showFeedback('Conta criada com sucesso!', false);
        setTimeout(() => this.#onSuccess(user), 1200);
      } catch (err) {
        showFeedback(this.#friendlyError(err));
      } finally {
        setLoading(false);
      }
    });

    const offGoogle = Dom.on(btnGoogle, 'click', async () => {
      hideFeedback();
      setLoading(true);
      try {
        const user = await AuthService.getInstance().signInWithGoogle();
        // Garante perfil no RTDB (cria se não existir)
        await AuthService.getInstance().ensureProfile(user)
          .catch(err => console.warn('[RegisterScreen] Erro ao garantir perfil Google:', err));
        this.#onSuccess(user);
      } catch (err) {
        showFeedback(this.#friendlyError(err));
      } finally {
        setLoading(false);
      }
    });

    const offLogin = Dom.on(linkLogin, 'click', () => {
      this.#manager.show('LoginScreen');
    });

    // Acessibilidade: Enter no link
    const offLoginKey = Dom.on(linkLogin, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.#manager.show('LoginScreen');
    });

    // Enter entre inputs
    const offKeyEmail   = Dom.on(emailInput,   'keydown', (e) => { if (e.key === 'Enter') passInput.focus(); });
    const offKeyPass    = Dom.on(passInput,    'keydown', (e) => { if (e.key === 'Enter') confirmInput.focus(); });
    const offKeyConfirm = Dom.on(confirmInput, 'keydown', (e) => { if (e.key === 'Enter') ageInput.focus(); });
    const offKeyAge     = Dom.on(ageInput,     'keydown', (e) => { if (e.key === 'Enter') btnCadastrar.click(); });

    this.#cleanups.push(
      offCadastrar, offGoogle, offLogin, offLoginKey,
      offKeyEmail, offKeyPass, offKeyConfirm, offKeyAge,
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

  /** Navega para MenuScreen passando o usuário cadastrado */
  #onSuccess(user) {
    this.#manager.show('MenuScreen', { user });
  }

  /**
   * Validação client-side para cadastro.
   * @returns {boolean}
   */
  #validate(email, pass, confirm, age, showFeedback) {
    const validateEmail    = Validator.email(email);
    const validatePass     = Validator.password(pass);
    const validateConfirm  = Validator.match(pass, confirm, 'senhas');
    const validateAge      = Validator.age(age);

    const result = Validator.combine(validateEmail, validatePass, validateConfirm, validateAge);

    if (!result.valid) {
      showFeedback(result.errors[0] || 'Validação falhou.');
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
