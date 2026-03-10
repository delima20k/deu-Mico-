/**
 * @layer    components
 * @group    game
 * @role     Animator
 * @depends  deck-shuffle.css
 * @exports  DeckShuffleAnimator
 *
 * Anima visualmente o monte de cartas com efeito de embaralhamento.
 *
 * Responsabilidades:
 *  - Receber o elemento do monte (.card-deck-pile)
 *  - Aplicar a classe CSS .deck-shuffle-animating ao elemento
 *  - Aguardar o evento animationend e resolver a Promise retornada por play()
 *  - Notificar o chamador via log ao iniciar e ao terminar
 *
 * Não recria nem desmonta o monte — apenas anima o elemento existente.
 *
 * @example
 *   import { DeckShuffleAnimator } from './DeckShuffleAnimator.js';
 *
 *   const animator = new DeckShuffleAnimator(deckPileElement);
 *   await animator.play();
 *   // animação concluída
 */

/** Classe CSS aplicada temporariamente durante a animação */
const ANIMATION_CLASS = 'deck-shuffle-animating';

export class DeckShuffleAnimator {
  /** @type {HTMLElement} Elemento .card-deck-pile a ser animado */
  #deckElement;

  /**
   * Handler de animationend registrado durante play().
   * Guardado para permitir remoção antecipada em stop()/reset().
   * @type {EventListener|null}
   */
  #endHandler = null;

  // ─────────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} deckElement - Elemento do monte de cartas (.card-deck-pile).
   *   Deve estar inserido no DOM no momento em que play() for chamado.
   */
  constructor(deckElement) {
    this.#deckElement = deckElement;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Inicia a animação de embaralhamento.
   *
   * - Se já houver uma animação em corso, ela é interrompida antes de iniciar.
   * - Resolve a Promise quando o evento animationend disparar.
   * - Em caso de interrupção via stop() ou reset(), a Promise não é resolvida.
   *
   * @returns {Promise<void>} Resolve ao final natural da animação.
   */
  play() {
    this.reset();

    console.log('[DeckShuffle] animation started');

    return new Promise(resolve => {
      this.#endHandler = () => {
        this.#cleanup();
        console.log('[DeckShuffle] animation finished');
        resolve();
      };

      this.#deckElement.addEventListener(
        'animationend',
        this.#endHandler,
        { once: true },
      );

      this.#deckElement.classList.add(ANIMATION_CLASS);
    });
  }

  /**
   * Interrompe a animação imediatamente, sem aguardar o fim natural.
   * O elemento retorna ao estado visual original.
   * A Promise retornada por play() (se houver) não será resolvida.
   */
  stop() {
    this.#cleanup();
  }

  /**
   * Remove a classe de animação e retorna o elemento ao estado normal.
   * Equivalente a stop() — oferecido como alias semântico para
   * contextos em que "resetar" é mais expressivo do que "parar".
   */
  reset() {
    this.#cleanup();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Remove o listener de animationend e a classe CSS do elemento.
   * Centraliza toda a limpeza de estado para evitar duplicação.
   */
  #cleanup() {
    if (this.#endHandler !== null) {
      this.#deckElement.removeEventListener('animationend', this.#endHandler);
      this.#endHandler = null;
    }

    this.#deckElement.classList.remove(ANIMATION_CLASS);
  }
}
