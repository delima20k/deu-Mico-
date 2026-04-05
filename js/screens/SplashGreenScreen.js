/**
 * @layer screens
 * @group splash
 * @role UI
 * @depends Screen, Dom, Time, LetterAnimator, LoadingDots, SoundManager, GameConfig, Footer
 * @exports SplashGreenScreen
 *
 * Tela de splash verde com animações de letras e sons.
 * Sequência: logo → dots → letras H1 → letras subtitle → jingle → HomeScreen.
 * Footer com logos de marca e app stores.
 */
import { Screen }         from '../core/Screen.js';
import { Dom }            from '../utils/Dom.js';
import { Time }           from '../utils/Time.js';
import { LetterAnimator } from '../components/LetterAnimator.js';
import { LoadingDots }    from '../components/LoadingDots.js';
import { SoundManager }   from '../utils/SoundManager.js';
import { GameConfig }     from '../domain/GameConfig.js';
import { Footer }         from '../components/Footer.js';

export class SplashGreenScreen extends Screen {

  /** @type {import('../core/ScreenManager.js').ScreenManager} */
  #manager;

  /** @type {LetterAnimator|null} */
  #titleAnimator = null;

  /** @type {LetterAnimator|null} */
  #subtitleAnimator = null;

  /** @type {LoadingDots|null} */
  #dots = null;

  /** @type {number|null} */
  #timeoutId = null;

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    super('SplashGreenScreen');
    this.#manager = screenManager;

    // Pré-carrega os sons
    const sfx = SoundManager.getInstance();
    sfx.load('letter_drop', 'audio/letter_drop.mp3', 0.7);
    sfx.load('ring_06',     'audio/ring_06.mp3',     0.9);
  }

  // -------------------------------------------------------
  // Template
  // -------------------------------------------------------

  _buildTemplate() {
    const wrapper = Dom.create('div', { classes: 'splash-green' });
    const content = Dom.create('div', { classes: 'splash-green__content' });

    // Logo
    const logo = Dom.create('img', {
      classes: 'splash-green__logo',
      attrs: {
        src: 'img/carta_logo.png',
        alt: 'Deu Mico — Logo',
        draggable: 'false',
      },
    });

    // Loading dots
    this.#dots = new LoadingDots();
    const dotsEl = this.#dots.create();

    // H1 — título principal
    const title = Dom.create('h1', { classes: 'splash-green__title' });

    // P — subtítulo
    const subtitle = Dom.create('p', { classes: 'splash-green__subtitle' });

    // Animadores
    this.#titleAnimator    = new LetterAnimator(title,    { delayBetween: 90,  initialDelay: 0, direction: 'from-top',    soundKey: 'letter_drop' });
    this.#subtitleAnimator = new LetterAnimator(subtitle, { delayBetween: 100, initialDelay: 0, direction: 'alternate-lr', soundKey: 'letter_drop' });

    this.#titleAnimator.setText('DEU MICO!!');
    this.#subtitleAnimator.setText('Prepare-se para jogar');

    content.append(logo, dotsEl, title, subtitle);
    wrapper.appendChild(content);

    // ── Footer com logos ──────────────────────────────────
    const footer = new Footer();
    wrapper.appendChild(footer.create());

    return wrapper;
  }

  // -------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------

  async onEnter() {
    // Anima o H1 (letras caindo + som por letra)
    await this.#titleAnimator.animate();

    // Pequena pausa e anima o subtítulo
    await Time.wait(200);
    await this.#subtitleAnimator.animate();

    // Toca o jingle de conclusão após todas as letras
    await SoundManager.getInstance().playOnce('ring_06');

    // Aguarda antes de avançar para a Home
    this.#timeoutId = Time.delay(() => {
      this.#manager.show('HomeScreen');
    }, GameConfig.SPLASH_POST_ANIM_DELAY);
  }

  onExit() {
    if (this.#timeoutId !== null) {
      Time.cancel(this.#timeoutId);
      this.#timeoutId = null;
    }
    this.#dots?.destroy();
  }
}
