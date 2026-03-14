/**
 * @layer    components
 * @group    game
 * @role     Animator
 * @depends  deck-shuffle.css
 * @exports  DeckShuffleAnimator
 *
 * Anima visualmente o embaralhamento do monte de cartas com efeito
 * de fan-out por carta individual em vez de mover o pilha inteira.
 *
 * Cada .card-back recebe:
 *  - CSS vars --card-base-tx / --card-base-ty / --card-base-rot
 *    copiadas do transform inline para que os keyframes partam da
 *    posição original de cada camada.
 *  - Uma das classes: .card-shuffle-left | .card-shuffle-right | .card-shuffle-top
 *  - Um animation-delay escalonado para criar o efeito de cascata.
 *
 * Proteção contra spam:
 *  - #isPlaying impede disparos simultâneos.
 *  - O botão de ação já é desabilitado por DeckActionPanel.setState('shuffling').
 *
 * @example
 *   const animator = new DeckShuffleAnimator(deckPileElement);
 *   await animator.play();               // alias de animateCentralDeckShuffle()
 *   await animator.animateCentralDeckShuffle({ intensity: 1.2, duration: 1300 });
 */

/** Duração padrão da animação de cada carta (ms). */
const DEFAULT_DURATION_MS = 1100;

/** Delay máximo de escalonamento entre cartas (ms). */
const MAX_STAGGER_MS = 80;

/** CSS classes por tipo de fan-out */
const CLASS_LEFT  = 'card-shuffle-left';
const CLASS_RIGHT = 'card-shuffle-right';
const CLASS_TOP   = 'card-shuffle-top';

/** Todos os nomes de classe de shuffle — usados na limpeza */
const ALL_SHUFFLE_CLASSES = [CLASS_LEFT, CLASS_RIGHT, CLASS_TOP];

export class DeckShuffleAnimator {
  /** @type {HTMLElement} Elemento .card-deck-pile */
  #deckElement;

  /** @type {boolean} Evita disparos simultâneos */
  #isPlaying = false;

  // ─────────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} deckElement - Elemento .card-deck-pile já no DOM.
   */
  constructor(deckElement) {
    this.#deckElement = deckElement;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Inicia a animação de embaralhamento por carta individual.
   *
   * - Respeita prefers-reduced-motion (duração colapsada).
   * - Spam-safe: retorna Promise já resolvida se uma animação estiver em curso.
   * - CSS var --shuffle-duration é definido no style do deckElement para que
   *   o CSS possa ler a duração configurada por este método.
   *
   * @param {Object}  [options]
   * @param {number}  [options.intensity=1]    - Multiplicador de amplitude 0.5–2.
   * @param {number}  [options.duration=1100]  - Duração em ms de cada carta.
   * @returns {Promise<void>} Resolve quando todas as cartas terminam a animação.
   */
  animateCentralDeckShuffle({ intensity = 1, duration = DEFAULT_DURATION_MS } = {}) {
    if (this.#isPlaying) {
      console.log('[DeckShuffle] ⚠️  Animação em andamento — requisição ignorada');
      return Promise.resolve();
    }

    this.#isPlaying = true;
    console.log('[DeckShuffle] 🃏 Animação de embaralhamento iniciada');

    const cards = Array.from(this.#deckElement.querySelectorAll('.card-back'));

    if (cards.length === 0) {
      this.#isPlaying = false;
      return Promise.resolve();
    }

    // Aplica duration via CSS var no container para que a propriedade
    // animation do CSS leia o valor correto via var(--shuffle-duration)
    const clampedDuration = Math.max(300, Math.min(3000, duration));
    this.#deckElement.style.setProperty('--shuffle-duration', `${clampedDuration}ms`);

    // Amplitude: sobrescreve as custom props de deslocamento
    const clampedIntensity = Math.max(0.3, Math.min(3, intensity));
    this.#deckElement.style.setProperty('--shuffle-dx', `${Math.round(26 * clampedIntensity)}px`);
    this.#deckElement.style.setProperty('--shuffle-rot', `${(8 * clampedIntensity).toFixed(1)}deg`);

    // Stagger proporcional à duração
    const staggerStep = Math.min(MAX_STAGGER_MS, clampedDuration * 0.07);

    const cardPromises = cards.map((card, index) => {
      return this.#animateCard(card, index, cards.length, staggerStep, clampedDuration);
    });

    return Promise.all(cardPromises).then(() => {
      this.#isPlaying = false;
      console.log('[DeckShuffle] ✅ Animação de embaralhamento concluída');
    });
  }

  /**
   * Alias semântico — mantém compatibilidade com chamadas existentes.
   * @param {Object} [options]
   * @returns {Promise<void>}
   */
  play(options) {
    return this.animateCentralDeckShuffle(options);
  }

  /**
   * Interrompe a animação limpando todas as classes e CSS vars adicionadas.
   * A Promise de animateCentralDeckShuffle() ainda resolverá (via Promise.all)
   * pois os listeners animationend foram adicionados com { once: true }.
   */
  stop() {
    this.#cleanupAll();
    this.#isPlaying = false;
  }

  /**
   * Alias semântico de stop().
   */
  reset() {
    this.stop();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Anima uma única carta do monte.
   *
   * O transform inline de cada carta (definido em CardDeckPile.#buildLayer) é
   * decomposto via regex para extrair tx, ty e rot.
   * Esses valores são expostos como CSS vars na carta para que os keyframes
   * partam da posição original e retornem a ela.
   *
   * @param {HTMLElement} card
   * @param {number}      index       - Índice no array de cartas
   * @param {number}      total       - Total de cartas
   * @param {number}      staggerStep - ms de delay por índice
   * @param {number}      duration    - ms da animação
   * @returns {Promise<void>}
   */
  #animateCard(card, index, total, staggerStep, duration) {
    const isTop = index === total - 1;

    // ── Extrai transform base do style inline ──────────────────────────────
    const { tx, ty, rot } = this.#parseTransform(card.style.transform);

    // Expõe como CSS vars na própria carta
    card.style.setProperty('--card-base-tx',        `${tx}px`);
    card.style.setProperty('--card-base-ty',        `${ty}px`);
    card.style.setProperty('--card-base-rot',       `${rot}deg`);
    card.style.setProperty('--card-base-transform',
      `translate(${tx}px, ${ty}px) rotate(${rot}deg)`);

    // ── Determina tipo de fan-out ─────────────────────────────────────────
    let shuffleClass;
    if (isTop) {
      shuffleClass = CLASS_TOP;
    } else {
      shuffleClass = index % 2 === 0 ? CLASS_LEFT : CLASS_RIGHT;
    }

    // ── Delay escalonado: índices do fundo para o topo ────────────────────
    const delay = isTop
      ? Math.round(staggerStep * (total - 1) * 0.5) // topo aparece no meio
      : Math.round(staggerStep * index * 0.6);

    card.style.animationDelay = `${delay}ms`;

    // ── Aplica classe (dispara animação) ──────────────────────────────────
    // reflow trick para garantir que re-adicionar a classe funcione
    void card.offsetWidth;
    card.classList.add(shuffleClass);

    // ── Resolve ao fim da animação ────────────────────────────────────────
    return new Promise(resolve => {
      const safetyMs = duration + delay + 300; // margem de segurança

      const timeout = setTimeout(() => {
        this.#cleanupCard(card);
        resolve();
      }, safetyMs);

      card.addEventListener('animationend', (e) => {
        if (e.target !== card) return;
        clearTimeout(timeout);
        this.#cleanupCard(card);
        resolve();
      }, { once: true });
    });
  }

  /**
   * Remove classes e CSS vars adicionadas a uma carta.
   * @param {HTMLElement} card
   */
  #cleanupCard(card) {
    card.classList.remove(...ALL_SHUFFLE_CLASSES);
    card.style.removeProperty('animation-delay');
    card.style.removeProperty('--card-base-tx');
    card.style.removeProperty('--card-base-ty');
    card.style.removeProperty('--card-base-rot');
    card.style.removeProperty('--card-base-transform');
  }

  /**
   * Remove classes + CSS vars de todas as cartas e do container.
   */
  #cleanupAll() {
    const cards = Array.from(this.#deckElement.querySelectorAll('.card-back'));
    cards.forEach(card => this.#cleanupCard(card));
    this.#deckElement.style.removeProperty('--shuffle-duration');
    this.#deckElement.style.removeProperty('--shuffle-dx');
    this.#deckElement.style.removeProperty('--shuffle-rot');
  }

  /**
   * Extrai tx, ty e rot de um transform inline como
   * "translate(Xpx, Ypx) rotate(Zdeg)"
   *
   * @param {string} transformStr
   * @returns {{ tx: number, ty: number, rot: number }}
   */
  #parseTransform(transformStr) {
    const txMatch  = transformStr.match(/translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\)/);
    const rotMatch = transformStr.match(/rotate\(\s*([-\d.]+)deg\)/);

    return {
      tx:  txMatch  ? parseFloat(txMatch[1])  : 0,
      ty:  txMatch  ? parseFloat(txMatch[2])  : 0,
      rot: rotMatch ? parseFloat(rotMatch[1]) : 0,
    };
  }
}

