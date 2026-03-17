/**
 * @layer    components
 * @group    game
 * @role     UI
 * @depends  Dom, SoundManager
 * @exports  GameExitButton
 *
 * Botão fixo "CORRER" para sair da mesa de jogo.
 * Posicionado no canto superior esquerdo via CSS (.game-exit-btn).
 * Exibe modal customizada com animações antes de chamar onExitRequested.
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

  /** @private */
  #handleClick() {
    SoundManager.getInstance().play('made');
    this.#showModal();
  }

  /**
   * Abre a modal de confirmação com slide-in da esquerda.
   * @private
   */
  #showModal() {
    document.querySelector('.exit-confirm-overlay')?.remove();

    const overlay = Dom.create('div', { classes: 'exit-confirm-overlay' });
    const modal   = Dom.create('div', { classes: 'exit-confirm-modal' });

    const icon   = Dom.create('div', { classes: 'exit-confirm-modal__icon', text: '🏃' });
    const msg    = Dom.create('p',   { classes: 'exit-confirm-modal__msg',
                                       text: 'Quer mesmo sair da partida?' });
    const sub    = Dom.create('p',   { classes: 'exit-confirm-modal__sub',
                                       text: 'Você perderá o progresso desta rodada.' });
    const btns   = Dom.create('div', { classes: 'exit-confirm-modal__btns' });

    const btnSim = Dom.create('button', {
      classes: ['exit-confirm-modal__btn', 'exit-confirm-modal__btn--yes'],
      text: '✔ Sim, sair',
      attrs: { type: 'button' },
    });
    const btnNao = Dom.create('button', {
      classes: ['exit-confirm-modal__btn', 'exit-confirm-modal__btn--no'],
      text: '✖ Não, ficar',
      attrs: { type: 'button' },
    });

    btns.append(btnSim, btnNao);
    modal.append(icon, msg, sub, btns);
    overlay.append(modal);
    document.body.append(overlay);

    // Dispara animação de entrada após dois frames (garante transição)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        modal.classList.add('exit-confirm-modal--in');
      });
    });

    // ── Confirmar: 3 flips crescentes até cobrir a tela → navega para salas
    btnSim.addEventListener('click', () => {
      const DURATION = 1350; // ms — deve bater com o CSS

      // Mede a modal para o scale inicial (rel. ao viewport)
      const rect       = modal.getBoundingClientRect();
      const startScale = Math.min(
        (rect.width  / window.innerWidth),
        (rect.height / window.innerHeight)
      ).toFixed(3);

      // Cria carta full-screen (position:fixed inset:0) que vai crescer virando
      const flipCard = Dom.create('div', { classes: 'exit-flip-card' });
      flipCard.style.setProperty('--s', startScale);
      document.body.append(flipCard);

      // Remove a modal de confirmação
      overlay.remove();

      // Inicia animação após dois frames
      requestAnimationFrame(() => requestAnimationFrame(() => {
        flipCard.classList.add('exit-flip-card--active');
      }));

      // Navega no meio do 2º flip (50% ≈ 675ms) — card está edge-on (invisível)
      setTimeout(() => this.#onExitRequested?.(), Math.round(DURATION * 0.50));

      // Remove carta após animação completa
      setTimeout(() => flipCard.remove(), DURATION + 100);
    });

    // ── Cancelar: slide-out para a esquerda
    const close = () => {
      modal.classList.remove('exit-confirm-modal--in');
      modal.classList.add('exit-confirm-modal--out');
      modal.addEventListener('animationend', () => overlay.remove(), { once: true });
    };

    btnNao.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  /** @returns {HTMLElement|null} */
  getElement() { return this.#el; }
}
