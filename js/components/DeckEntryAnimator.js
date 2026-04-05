/**
 * @layer    components
 * @group    game
 * @role     Animator
 * @depends  card-deck-pile.css (.deck-entry-animating)
 * @exports  DeckEntryAnimator
 *
 * Anima a entrada do monte de cartas ao centro da mesa.
 *
 * Responsabilidades:
 *  - Aplicar .deck-entry-animating ao elemento .card-deck-pile
 *  - Aguardar animationend e remover a classe (retorna Promise)
 *  - Expor animateCentralDeckEntry() como método principal
 *  - Respeitar preferência de movimento reduzido (prefers-reduced-motion)
 *  - Permitir reuso em nova rodada via play() multiple vezes
 *
 * Separação de concerns:
 *  - Keyframes e timings vivem em card-deck-pile.css
 *  - Este módulo apenas orquestra a classe e os eventos DOM
 *
 * @example
 *   import { DeckEntryAnimator } from './DeckEntryAnimator.js';
 *
 *   const animator = new DeckEntryAnimator(deckPileElement);
 *   await animator.animateCentralDeckEntry();
 *   // monte está visível e em repouso
 */

/** Classe CSS que dispara a animação de entrada. */
const ENTRY_CLASS = 'deck-entry-animating';

/** Duração total da animação (ms) — deve bater com o CSS. */
const ENTRY_DURATION_MS = 550;

export class DeckEntryAnimator {
  /** @type {HTMLElement} Elemento .card-deck-pile a ser animado */
  #deckElement;

  /**
   * Handler de animationend ativo no momento — guardado para
   * permitir remoção antecipada se a animação for interrompida.
   * @type {EventListener|null}
   */
  #endHandler = null;

  /**
   * Indica se o usuário prefere movimento reduzido.
   * Capturado uma vez na construção para evitar leituras repetidas.
   * @type {boolean}
   */
  #reducedMotion;

  // ─────────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} deckElement - Elemento .card-deck-pile já inserido
   *   no DOM e posicionado pelo wrapper .deck-center-stack.
   */
  constructor(deckElement) {
    this.#deckElement   = deckElement;
    this.#reducedMotion = DeckEntryAnimator.#prefersReducedMotion();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Executa a animação de entrada do monte.
   *
   * - Se prefers-reduced-motion estiver ativo, resolve imediatamente
   *   sem animar (acessibilidade).
   * - Se uma animação anterior ainda estiver rodando, ela é cancelada
   *   antes de iniciar a nova (safe para nova rodada).
   * - Resolve quando a animação termina ou após timeout de segurança.
   *
   * @returns {Promise<void>} Resolvida ao final da animação.
   */
  animateCentralDeckEntry() {
    return new Promise(resolve => {
      // Acessibilidade: sem movimento se o usuário preferir
      if (this.#reducedMotion) {
        this.#ensureVisible();
        console.log('[DeckEntryAnimator] ♿ prefers-reduced-motion: animação ignorada');
        resolve();
        return;
      }

      // Cancela animação anterior se ainda correr
      this.#cancel();

      // Garante que o elemento está visível antes de animar
      this.#ensureVisible();

      // Força reflow para que a remoção anterior da classe seja commitada
      // antes de adicionar novamente — evita que o browser ignore a mudança.
      void this.#deckElement.offsetWidth;

      // Ativa animação via CSS
      this.#deckElement.classList.add(ENTRY_CLASS);

      console.log('[DeckEntryAnimator] 🎬 Animação de entrada iniciada');

      // Timeout de segurança: evita Promise presa se animationend não disparar
      // (ex: elemento removido do DOM durante a animação)
      const safetyTimer = setTimeout(() => {
        this.#cleanup();
        console.warn('[DeckEntryAnimator] ⚠️ Timeout de segurança atingido — finalizando');
        resolve();
      }, ENTRY_DURATION_MS + 200);

      // Handler principal: resolve na conclusão natural da animação
      this.#endHandler = (e) => {
        // Filtra bolha de animações filhas (badge, card-back, etc.)
        if (e.target !== this.#deckElement) return;

        clearTimeout(safetyTimer);
        this.#cleanup();
        console.log('[DeckEntryAnimator] ✅ Animação de entrada concluída');
        resolve();
      };

      this.#deckElement.addEventListener('animationend', this.#endHandler);
    });
  }

  /**
   * Atalho semântico — mesmo comportamento de animateCentralDeckEntry().
   * @returns {Promise<void>}
   */
  play() {
    return this.animateCentralDeckEntry();
  }

  /**
   * Interrompe a animação imediatamente e restaura visibilidade.
   * Seguro chamar mesmo sem animação em curso.
   */
  cancel() {
    this.#cancel();
    this.#ensureVisible();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  /** Remove a classe de animação e o listener ativo. */
  #cleanup() {
    this.#deckElement.classList.remove(ENTRY_CLASS);
    if (this.#endHandler) {
      this.#deckElement.removeEventListener('animationend', this.#endHandler);
      this.#endHandler = null;
    }
  }

  /** Interrompe animação anterior sem restaurar visibilidade. */
  #cancel() {
    this.#cleanup();
  }

  /**
   * Garante que o elemento está com opacity e transform no estado
   * final correto (sem animação aplicada).
   * Previne glitch visual caso chamado fora de animação.
   */
  #ensureVisible() {
    this.#deckElement.style.opacity  = '';
    this.#deckElement.style.transform = '';
  }

  /**
   * Verifica via MediaQuery se o usuário prefere movimento reduzido.
   * @returns {boolean}
   */
  static #prefersReducedMotion() {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    );
  }
}
