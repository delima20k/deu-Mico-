/**
 * @layer    components
 * @group    game
 * @role     Animator
 * @depends  deck-deal.css
 * @exports  DeckDealAnimator
 *
 * Anima a formação inicial do monte de cartas:
 * cada carta voa de fora da tela (esquerda / direita / topo / baixo)
 * até o centro do monte e se empilha, desaparecendo na pilha.
 *
 * Após a última carta pousar o .card-deck-pile é exibido com fade-in,
 * revelando o monte estático formado.
 *
 * Responsabilidades:
 *  - Medir a posição do pile via getBoundingClientRect()
 *  - Criar .deck-deal-stage (overlay fixed z-8500) no document.body
 *  - Para cada carta: criar .deal-card posicionado no pile com delay escalonado
 *  - Remover cada carta do DOM ao receber animationend (mantém ≤12 layers ativos)
 *  - Ao final: remover stage, revelar pile com opacity transition
 *  - Respeitar prefers-reduced-motion
 *
 * Não recria nem modifica o .card-deck-pile — apenas o esconde
 * temporariamente e o revela ao final.
 *
 * @example
 *   const animator = new DeckDealAnimator(deckPileElement);
 *   await animator.animate(69);
 *   // pile visível; 69 cartas distribuídas
 */

/** ms de delay entre cartas consecutivas */
const STAGGER_MS = 22;

/**
 * Duração de cada carta (ms).
 * Deve corresponder ao valor de --deal-dur no CSS (default 480ms).
 * A duração real pode ser menor em mobile — usada apenas como
 * base para o safety timeout.
 */
const DURATION_MS = 480;

/** ms extras adicionados ao safety timeout além de duration + delay */
const SAFETY_MARGIN_MS = 600;

/**
 * Sequência determinística de direções.
 * Cicla por modulo sobre len=15 → distribui bem ao longo das 69 cartas.
 * Distribuição: left 33% · right 33% · top 20% · bottom 13%
 *
 * @type {readonly string[]}
 */
const DIR_SEQUENCE = Object.freeze([
  'left',   'right', 'left',   'right', 'top',
  'left',   'right', 'bottom', 'left',  'right',
  'top',    'right', 'left',   'bottom', 'right',
]);

export class DeckDealAnimator {
  /** @type {HTMLElement} Elemento .card-deck-pile já no DOM */
  #deckElement;

  // ─────────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} deckElement - .card-deck-pile já inserido no DOM.
   *   Deve estar no layout ao chamar animate() (getBoundingClientRect usará seus valores).
   */
  constructor(deckElement) {
    this.#deckElement = deckElement;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Executa a animação de distribuição inicial das cartas.
   *
   * 1. Se prefers-reduced-motion → resolve imediatamente.
   * 2. Aguarda um requestAnimationFrame para garantir que o layout
   *    do pile está commitado antes de medir sua posição.
   * 3. Esconde o pile estático (opacity 0).
   * 4. Cria .deck-deal-stage e popula com `count` .deal-cards estalonadas.
   * 5. Cada carta remove-se do DOM ao animationend (segurança: safety timeout).
   * 6. Quando a última carta termina: remove stage, revela pile com fade.
   *
   * @param {number} [count=69] - Quantidade de cartas a animar.
   * @returns {Promise<void>} Resolve quando a última carta pousa e o pile está visível.
   */
  animate(count = 67) {
    if (DeckDealAnimator.#prefersReducedMotion()) {
      console.log('[DeckDealAnimator] ♿ prefers-reduced-motion — animação ignorada');
      return Promise.resolve();
    }

    return new Promise(resolve => {
      // Aguarda o browser commitar o layout antes de medir posição
      requestAnimationFrame(() => {
        const rect = this.#deckElement.getBoundingClientRect();

        if (rect.width === 0 || rect.height === 0) {
          console.warn('[DeckDealAnimator] ⚠️ Pile sem dimensões — animação ignorada');
          resolve();
          return;
        }

        console.log(`[DeckDealAnimator] 🃏 Iniciando distribuição de ${count} cartas`);
        this.#runDeal(rect, count, resolve);
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Executa o loop principal da animação após medir o pile.
   *
   * @param {DOMRect}  rect   - BoundingClientRect do pile
   * @param {number}   count  - Total de cartas
   * @param {Function} resolve
   */
  #runDeal(rect, count, resolve) {
    // Esconde o pile estático enquanto as cartas voam
    this.#deckElement.style.opacity = '0';

    // Cria overlay
    const stage = document.createElement('div');
    stage.className = 'deck-deal-stage';
    document.body.appendChild(stage);

    let completedCount = 0;

    const onCardDone = () => {
      completedCount++;
      if (completedCount === count) {
        this.#finish(stage, resolve);
      }
    };

    for (let i = 0; i < count; i++) {
      this.#createCard(stage, i, rect, onCardDone);
    }
  }

  /**
   * Cria uma única .deal-card posicionada no pile com delay escalonado.
   *
   * Cada carta tem position:fixed com left/top/width/height copiados do
   * pile. O keyframe CSS move a carta de fora da tela para translate(0,0)
   * (posição do pile) e então a encolhe até desaparecer.
   *
   * @param {HTMLElement} stage
   * @param {number}      index       - Índice 0-based da carta
   * @param {DOMRect}     pileRect    - Rect do pile
   * @param {Function}    onDone      - Callback ao fim desta carta
   */
  #createCard(stage, index, pileRect, onDone) {
    const delay = index * STAGGER_MS;
    const dir   = DIR_SEQUENCE[index % DIR_SEQUENCE.length];

    const card = document.createElement('div');
    card.className   = 'deal-card';
    card.dataset.dir = dir;

    // Posiciona a carta exatamente sobre o pile
    card.style.left   = `${pileRect.left}px`;
    card.style.top    = `${pileRect.top}px`;
    card.style.width  = `${pileRect.width}px`;
    card.style.height = `${pileRect.height}px`;

    // Delay escalonado — cartas chegam uma a uma em cascata
    card.style.animationDelay = `${delay}ms`;

    // Cartas mais recentes ficam acima na pilha visualmente
    card.style.zIndex = String(8500 + index);

    // Safety timeout — evita Promise presa se animationend não disparar
    // (ex: carta fora do viewport ou tab em segundo plano)
    const safetyMs = DURATION_MS + delay + SAFETY_MARGIN_MS;
    const safetyTimer = setTimeout(() => {
      card.remove();
      onDone();
    }, safetyMs);

    card.addEventListener('animationend', () => {
      clearTimeout(safetyTimer);
      card.remove();
      onDone();
    }, { once: true });

    stage.appendChild(card);
  }

  /**
   * Finaliza a animação: remove stage e revela o pile com fade-in.
   *
   * @param {HTMLElement} stage
   * @param {Function}    resolve
   */
  #finish(stage, resolve) {
    stage.remove();

    // Fade-in do pile estático (6 camadas visuais)
    this.#deckElement.style.transition = 'opacity 0.35s ease';
    this.#deckElement.style.opacity    = '1';

    // Limpa propriedades inline após a transição para não interferir com
    // animações futuras (nova rodada, shuffle, etc.)
    this.#deckElement.addEventListener('transitionend', () => {
      this.#deckElement.style.removeProperty('opacity');
      this.#deckElement.style.removeProperty('transition');
    }, { once: true });

    console.log('[DeckDealAnimator] ✅ Distribuição concluída — monte formado');
    resolve();
  }

  /**
   * @returns {boolean} true se o usuário preferir movimento reduzido.
   */
  static #prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
