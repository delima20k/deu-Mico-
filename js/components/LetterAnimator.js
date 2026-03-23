/**
 * @layer components
 * @group animation
 * @role UI
 * @depends Time, SoundManager
 * @exports LetterAnimator
 *
 * Componente reutilizável que anima texto letra a letra.
 * Suporta dois modos de entrada:
 *   - 'alternate-lr' : letras alternando esquerda/direita
 *   - 'from-top'     : letras caindo de cima com bounce
 * Dispara som opcional via SoundManager a cada letra animada.
 */
import { Time }         from '../utils/Time.js';
import { SoundManager } from '../utils/SoundManager.js';

export class LetterAnimator {
  /** @type {HTMLElement} */
  #el;

  /** @type {number} ms entre cada letra */
  #delayBetween;

  /** @type {number} ms antes da primeira letra */
  #initialDelay;

  /** @type {'alternate-lr'|'from-top'} */
  #direction;

  /** @type {string|null} chave no SoundManager */
  #soundKey;

  /** @type {HTMLElement[]} */
  #spans = [];

  /**
   * @param {HTMLElement} element - Elemento alvo (h1, p, etc.)
   * @param {Object} [options]
   * @param {number}  [options.delayBetween=80]
   * @param {number}  [options.initialDelay=0]
   * @param {'alternate-lr'|'from-top'} [options.direction='alternate-lr']
   * @param {string|null} [options.soundKey=null]
   */
  constructor(element, {
    delayBetween = 80,
    initialDelay = 0,
    direction    = 'alternate-lr',
    soundKey     = null,
  } = {}) {
    this.#el           = element;
    this.#delayBetween = delayBetween;
    this.#initialDelay = initialDelay;
    this.#direction    = direction;
    this.#soundKey     = soundKey;
  }

  // -------------------------------------------------------
  // Configuração
  // -------------------------------------------------------

  /**
   * Popula o elemento com spans por letra a partir do texto fornecido.
   * Deve ser chamado antes de animate().
   * @param {string} text
   */
  setText(text) {
    this.#el.innerHTML = '';
    this.#spans = [];

    [...text].forEach((char, index) => {
      const span = document.createElement('span');

      if (char === ' ') {
        span.classList.add('letter-span', 'letter-span--space');
        span.setAttribute('aria-hidden', 'true');
      } else {
        span.classList.add('letter-span');
        span.textContent = char;
      }

      span.dataset.direction = index % 2 === 0 ? 'left' : 'right';
      this.#el.appendChild(span);
      this.#spans.push(span);
    });

    this.#el.setAttribute('aria-label', text);
  }

  // -------------------------------------------------------
  // Animação
  // -------------------------------------------------------

  /**
   * Inicia a animação das letras.
   * @returns {Promise<void>} resolve quando todas terminam
   */
  animate() {
    return new Promise(resolve => {
      if (Time.prefersReducedMotion()) {
        this.#spans.forEach(span => { span.style.opacity = '1'; });
        resolve();
        return;
      }

      if (this.#spans.length === 0) { resolve(); return; }

      const totalDuration = this.#initialDelay
        + this.#spans.length * this.#delayBetween
        + 450; // duração da animação da última letra

      const sound = this.#soundKey ? SoundManager.getInstance() : null;

      this.#spans.forEach((span, index) => {
        const delay = this.#initialDelay + index * this.#delayBetween;

        const dirClass = this.#direction === 'from-top'
          ? 'letter-from-top'
          : (span.dataset.direction === 'left' ? 'letter-from-left' : 'letter-from-right');

        span.style.animationDelay = `${delay}ms`;
        span.classList.add(dirClass);

        if (sound && span.textContent.trim() !== '') {
          Time.delay(() => sound.play(this.#soundKey), delay);
        }
      });

      Time.delay(resolve, totalDuration);
    });
  }

  // -------------------------------------------------------
  // Utilitários
  // -------------------------------------------------------

  /** @returns {number} Duração total da animação em ms */
  getTotalDuration() {
    return this.#initialDelay + this.#spans.length * this.#delayBetween + 450;
  }

  /** Torna todas as letras visíveis imediatamente (sem animação). */
  showImmediate() {
    this.#spans.forEach(span => {
      span.style.opacity   = '1';
      span.style.transform = 'translateX(0)';
    });
  }
}
