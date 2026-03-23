/**
 * @layer    components
 * @group    game
 * @role     Animator
 * @depends  deck-shuffle.css (.shuffle-stage, .shuffle-card)
 * @exports  ShuffleAnimator
 *
 * Anima o embaralhamento do monte em caminho RETANGULAR ao redor do pile.
 *
 * Caminho (percurso completo = 520 px):
 *
 *   Segmento 1 — DIREITA  : pile-center → +100 px X  (saída pela direita)
 *   Segmento 2 — BAIXO    : +100 X      → +60 px Y   (desce 60 px)
 *   Segmento 3 — ESQUERDA : +100 X      → −100 px X  (percorre 200 px p/ esquerda)
 *   Segmento 4 — CIMA     : +60 Y       → 0 Y        (sobe 60 px)
 *   Segmento 5 — DIREITA  : −100 X      → 0 X        (entra pelo lado esquerdo)
 *
 *                       ←── 200 px ──→
 *     [ENTRA] (−100,0) ────────────────── (+100,0) [SAI]
 *           |                                           |
 *         100px                                       100px
 *    (pile center)                                      |
 *           |                                           |  60px
 *           └──────────── (+100,+60) ──── (−100,+60) ──┘
 *                         ←── 200 px ──→
 *
 * Visibilidade:
 *   - Todas as cartas visíveis durante o trajeto (caminho inferior é acima do
 *     fundo da pilha na tela).
 *   - Fade-in ao sair do pile (0–20 px), fade-out ao entrar (500–520 px).
 *
 * Espaçamento: 10 px entre cartas consecutivas ao longo do caminho.
 * Velocidade  : 2 ciclos × 3200 ms = 6400 ms (lento, suave).
 *
 * @example
 *   const animator = new ShuffleAnimator(deckPileElement);
 *   await animator.animateCentralDeckShuffle();
 */

/** Número de voltas completas no caminho retangular. */
const CYCLES = 2;

/** Duração de cada volta completa em ms. */
const ORBIT_CYCLE_MS = 3200;

/** Total de cartas no baralho. */
const CARD_COUNT = 67;

/** Espaçamento em px entre cartas consecutivas no caminho. */
const CARD_GAP_PX = 10;

/**
 * Comprimento total do caminho retangular (px).
 * 100 (dir) + 60 (baixo) + 200 (esq) + 60 (cima) + 100 (dir-entrada) = 520
 */
const TOTAL_PATH_PX = 520;

/** Zona de fade-in/out nas extremidades (px). */
const FADE_ZONE_PX = 20;

export class ShuffleAnimator {
  /** @type {HTMLElement} */
  #deckElement;

  /** @type {boolean} Evita disparos simultâneos */
  #isPlaying = false;

  /** @type {number|null} ID do requestAnimationFrame ativo */
  #rafId = null;

  /** @type {HTMLElement[]} Cartas criadas durante a animação (para reposicionamento) */
  #cards = [];

  /** @type {Function|null} Handler de resize instalado durante a animação */
  #resizeHandler = null;

  // ─────────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} deckElement - .card-deck-pile já no DOM.
   */
  constructor(deckElement) {
    this.#deckElement = deckElement;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Executa a animação orbital de embaralhamento.
   * Spam-safe: retorna Promise resolvida se já estiver em andamento.
   *
   * @returns {Promise<void>} Resolve após todos os ciclos orbitais.
   */
  animateCentralDeckShuffle() {
    if (this.#isPlaying) {
      console.log('[ShuffleAnimator] ⚠️ Animação em andamento — ignorado');
      return Promise.resolve();
    }
    return this.#run();
  }

  /**
   * Alias semântico — compatibilidade com chamadas existentes.
   * @returns {Promise<void>}
   */
  play() {
    return this.animateCentralDeckShuffle();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — Orquestração
  // ─────────────────────────────────────────────────────────────────────────

  async #run() {
    this.#isPlaying = true;
    const reduced = ShuffleAnimator.#prefersReducedMotion();
    console.log('[ShuffleAnimator] 🃏 Embaralhamento orbital iniciado');

    // Aguarda layout commitado antes de medir posição inicial
    await this.#nextFrame();

    const rect = this.#deckElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.warn('[ShuffleAnimator] ⚠️ Pile sem dimensões — animação ignorada');
      this.#isPlaying = false;
      return;
    }

    // Esconde pile estático enquanto as cartas orbitam
    this.#deckElement.style.opacity = '0';

    // Cria overlay fixed
    const stage = document.createElement('div');
    stage.className = 'shuffle-stage';
    document.body.appendChild(stage);

    // Cria as 69 cartas posicionadas sobre o pile
    const cards = this.#createCards(stage, rect);
    this.#cards = cards;

    // Listener de resize: reposiciona as cartas quando a orientação muda
    this.#resizeHandler = () => this.#onResize();
    window.addEventListener('resize', this.#resizeHandler);

    // Dois frames para garantir que o estado inicial foi pintado
    await this.#nextFrame();
    await this.#nextFrame();

    // Executa animação orbital (rAF)
    await this.#animateOrbit(cards, rect, reduced);

    // Limpeza
    window.removeEventListener('resize', this.#resizeHandler);
    this.#resizeHandler = null;
    this.#cards = [];
    stage.remove();

    // Restaura pile com fade-in suave
    this.#deckElement.style.transition = 'opacity 0.35s ease';
    this.#deckElement.style.opacity    = '1';
    this.#deckElement.addEventListener('transitionend', () => {
      this.#deckElement.style.removeProperty('opacity');
      this.#deckElement.style.removeProperty('transition');
    }, { once: true });

    this.#isPlaying = false;
    console.log('[ShuffleAnimator] ✅ Embaralhamento orbital concluído');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — Animação orbital (rAF)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Anima 69 cartas ao longo do caminho retangular ao redor do monte.
   *
   * O progresso avança linearmente; cada carta i está fixamente defasada
   * em i × CARD_GAP_PX "atrás" do líder (carta 0) ao longo do percurso.
   *
   * @param {HTMLElement[]} cards
   * @param {DOMRect}       rect     - BoundingClientRect do pile
   * @param {boolean}       reduced  - prefers-reduced-motion
   * @returns {Promise<void>}
   */
  #animateOrbit(cards, rect, reduced) {
    const cycleDuration = reduced ? 60 : ORBIT_CYCLE_MS;
    const totalDuration = cycleDuration * CYCLES;
    const startTime     = performance.now();

    console.log('[ShuffleAnimator]   caminho retangular 100→60→200→60→100 px');

    return new Promise(resolve => {
      const frame = (now) => {
        const elapsed  = now - startTime;
        const progress = Math.min(elapsed / totalDuration, 1);

        // Distância percorrida pela carta líder (carta 0) no caminho total
        const leadDist = progress * CYCLES * TOTAL_PATH_PX;

        cards.forEach((card, i) => {
          // Distância percorrida por esta carta (atrás do líder)
          const dist = leadDist - i * CARD_GAP_PX;

          if (dist <= 0) {
            // Carta ainda não saiu do pile
            card.style.opacity   = '0';
            card.style.transform = 'translateX(0px) translateY(0px)';
            return;
          }

          const { x, y } = ShuffleAnimator.#posOnPath(dist);

          // Opacidade: fade-in ao sair, fade-out ao entrar
          const dMod = ((dist % TOTAL_PATH_PX) + TOTAL_PATH_PX) % TOTAL_PATH_PX;
          let opacity = 1;
          if      (dMod < FADE_ZONE_PX)               opacity = dMod / FADE_ZONE_PX;
          else if (dMod > TOTAL_PATH_PX - FADE_ZONE_PX) opacity = (TOTAL_PATH_PX - dMod) / FADE_ZONE_PX;

          card.style.opacity   = opacity.toFixed(3);
          card.style.transform = `translateX(${x.toFixed(1)}px) translateY(${y.toFixed(1)}px)`;
        });

        if (progress < 1) {
          this.#rafId = requestAnimationFrame(frame);
        } else {
          // Retorna todas as cartas ao centro antes de remover o stage
          cards.forEach(card => {
            card.style.transition = 'transform 0.25s ease-out, opacity 0.2s ease-out';
            card.style.transform  = 'translateX(0px) translateY(0px)';
            card.style.opacity    = '0';
          });
          setTimeout(resolve, 300);
        }
      };

      this.#rafId = requestAnimationFrame(frame);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — DOM
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Cria CARD_COUNT .shuffle-card posicionadas sobre o pile.
   * Todas começam empilhadas no pile com opacity 0.
   *
   * @param {HTMLElement} stage - .shuffle-stage já no DOM.
   * @param {DOMRect}     rect  - BoundingClientRect do pile.
   * @returns {HTMLElement[]}
   */
  #createCards(stage, rect) {
    const cards = [];

    for (let i = 0; i < CARD_COUNT; i++) {
      const card         = document.createElement('div');
      card.className     = 'shuffle-card';
      card.style.left    = `${rect.left}px`;
      card.style.top     = `${rect.top}px`;
      card.style.width   = `${rect.width}px`;
      card.style.height  = `${rect.height}px`;
      card.style.zIndex  = String(7000 + i);
      card.style.opacity = '0';
      card.style.transform = 'translateX(0px) translateY(0px)';

      stage.appendChild(card);
      cards.push(card);
    }

    return cards;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — Geometria do caminho retangular
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Retorna as coordenadas (x, y) relativas ao centro do pile
   * para uma distância percorrida `dist` ao longo do caminho retangular.
   *
   * Caminho (total = 520 px, sentido horário a partir do centro):
   *
   *   d ∈ [  0, 100] → Seg 1 DIREITA : x = d,       y = 0
   *   d ∈ [100, 160] → Seg 2 BAIXO   : x = 100,     y = d − 100
   *   d ∈ [160, 360] → Seg 3 ESQUERDA: x = 300 − d, y = 60      (100 → −100)
   *   d ∈ [360, 420] → Seg 4 CIMA    : x = −100,    y = 420 − d (60 → 0)
   *   d ∈ [420, 520] → Seg 5 DIREITA : x = d − 520, y = 0       (−100 → 0)
   *
   * @param {number} rawDist - Distância total percorrida (pode ser > TOTAL_PATH_PX).
   * @returns {{ x: number, y: number }}
   */
  static #posOnPath(rawDist) {
    const d = ((rawDist % TOTAL_PATH_PX) + TOTAL_PATH_PX) % TOTAL_PATH_PX;

    if (d <= 100) {
      // Segmento 1: SAI pela DIREITA (+100 px)
      return { x: d, y: 0 };
    }
    if (d <= 160) {
      // Segmento 2: DESCE 60 px
      return { x: 100, y: d - 100 };
    }
    if (d <= 360) {
      // Segmento 3: vai para a ESQUERDA 200 px  (+100 → −100)
      return { x: 100 - (d - 160), y: 60 };
    }
    if (d <= 420) {
      // Segmento 4: SOBE 60 px
      return { x: -100, y: 60 - (d - 360) };
    }
    // Segmento 5: vai para a DIREITA 100 px, ENTRA pelo lado esquerdo (−100 → 0)
    return { x: -100 + (d - 420), y: 0 };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — Utilitários
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Reposiciona todas as cartas quando a orientação/tamanho da janela muda.
   * Chamado pelo listener de resize instalado durante a animação.
   */
  #onResize() {
    if (!this.#isPlaying || this.#cards.length === 0) return;
    const newRect = this.#deckElement.getBoundingClientRect();
    if (newRect.width === 0 || newRect.height === 0) return;
    this.#cards.forEach(card => {
      card.style.left   = `${newRect.left}px`;
      card.style.top    = `${newRect.top}px`;
      card.style.width  = `${newRect.width}px`;
      card.style.height = `${newRect.height}px`;
    });
  }

  /**
   * Promise que resolve após `ms` milissegundos.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  #wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Promise que resolve no próximo animation frame.
   * @returns {Promise<void>}
   */
  #nextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  /**
   * Verifica preferência de movimento reduzido.
   * @returns {boolean}
   */
  static #prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
