/**
 * @layer    components
 * @group    game
 * @role     Animator
 * @exports  CardDealAnimator
 *
 * Anima a distribuição de cartas do monte central para cada jogador.
 *
 * Para cada carta na sequência de distribuição:
 *  1. Cria um elemento `.deal-fly-card` na posição do monte (fixed overlay).
 *  2. Anima para a posição do badge do jogador alvo via CSS transition.
 *  3. Chama `onCardArrived(uid, card)` ao chegar.
 *
 * O deal é feito em round-robin: [p0, p1, ..., pN, p0, p1, ...] parcela
 * uma carta por vez, começando pelo jogador mais novo.
 */

/** Tamanho da carta voadora (deve acompanhar breakpoints de card-deck-pile.css) */
const FLY_W = 'clamp(36px, 9vw, 60px)';
const FLY_H = 'clamp(54px, 13.5vw, 90px)';

/** Duração do voo de cada carta em ms */
const FLY_DURATION_MS = 200;

/** Pausa extra entre cartas consecutivas (ms) */
const BETWEEN_MS = 30;

export class CardDealAnimator {
  /** @type {HTMLElement} Elemento do monte de cartas */
  #pileEl;

  /**
   * Sequência de distribuição no sentido horário, começando pelo dealer.
   * @type {Array<{uid: string, cards: import('../domain/Card.js').Card[]}>}
   */
  #dealSequence;

  /** @type {string} UID do jogador local */
  #myUid;

  /**
   * Chamado quando uma carta chega ao jogador destino.
   * @type {function(uid: string, card: import('../domain/Card.js').Card): void}
   */
  #onCardArrived;

  /**
   * Chamado quando uma carta sai do monte (decrementar contador).
   * @type {function(): void}
   */
  #onCardLeaving;

  /** @type {function(): void} Chamado ao finalizar toda a distribuição */
  #onDone;

  /**
   * @param {Object} params
   * @param {HTMLElement}  params.pileEl         - Elemento `.card-deck-pile`.
   * @param {Array<{uid: string, cards: import('../domain/Card.js').Card[]}>} params.dealSequence
   *   Jogadores em ordem de distribuição (dealer primeiro, horário).
   * @param {string}   params.myUid              - UID do jogador local.
   * @param {Function} [params.onCardArrived]    - Callback por carta entregue.
   * @param {Function} [params.onCardLeaving]    - Callback ao sair do monte (para contador).
   * @param {Function} [params.onDone]           - Callback ao terminar tudo.
   */
  constructor({ pileEl, dealSequence, myUid, onCardArrived = () => {}, onCardLeaving = () => {}, onDone = () => {} }) {
    this.#pileEl        = pileEl;
    this.#dealSequence  = dealSequence;
    this.#myUid         = myUid;
    this.#onCardArrived = onCardArrived;
    this.#onCardLeaving = onCardLeaving;
    this.#onDone        = onDone;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Inicia a sequência de distribuição de cartas.
   * Cada carta aguarda a anterior chegar antes de iniciar a próxima.
   * @returns {Promise<void>} Resolvida após a última carta ser entregue.
   */
  async start() {
    const flatDeals = this.#buildFlatDealOrder();
    console.log(`[CardDealAnimator] 🎴 Iniciando distribuição de ${flatDeals.length} cartas`);

    for (let i = 0; i < flatDeals.length; i++) {
      const { uid, card } = flatDeals[i];
      try {
        this.#onCardLeaving();
        await this.#flyCard(uid, card);
        this.#onCardArrived(uid, card);
        await this.#wait(BETWEEN_MS);
      } catch (err) {
        console.error(`[CardDealAnimator] Erro na carta ${i + 1}/${flatDeals.length}:`, err);
        // Continua para a próxima carta mesmo com erro
      }
    }

    console.log('[CardDealAnimator] ✅ Distribuição concluída');
    this.#onDone();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Constrói a lista plana de entregas em round-robin.
   * Resultado: [p0c0, p1c0, ..., pNc0, p0c1, p1c1, ...]
   * @private
   * @returns {Array<{uid: string, card: import('../domain/Card.js').Card}>}
   */
  #buildFlatDealOrder() {
    const maxRounds = Math.max(...this.#dealSequence.map(p => p.cards.length), 0);
    const flat      = [];

    for (let round = 0; round < maxRounds; round++) {
      for (const player of this.#dealSequence) {
        if (round < player.cards.length) {
          flat.push({ uid: player.uid, card: player.cards[round] });
        }
      }
    }

    return flat;
  }

  /**
   * Anima uma carta voando do monte até o badge do jogador alvo.
   * Usa transform: translate(dx,dy) puro — sem calc(), compatibilidade máxima.
   * @param {string} uid - UID do jogador destino.
   * @param {import('../domain/Card.js').Card} card
   * @returns {Promise<void>}
   * @private
   */
  #flyCard(uid, card) {
    return new Promise(resolve => {
      // Posição de início: centro do monte
      const pileRect = this.#pileEl.getBoundingClientRect();
      const startX   = pileRect.left + pileRect.width  / 2;
      const startY   = pileRect.top  + pileRect.height / 2;

      // Posição de destino: centro do badge do jogador
      const badgeEl  = document.querySelector(`.player-badge[data-uid="${uid}"]`);
      let endX = startX;
      let endY = startY;
      if (badgeEl) {
        const r = badgeEl.getBoundingClientRect();
        endX    = r.left + r.width  / 2;
        endY    = r.top  + r.height / 2;
      }

      // Cria elemento fora do fluxo, sem transform de centering ainda
      const fly = document.createElement('div');
      fly.className = 'deal-fly-card';
      Object.assign(fly.style, {
        width:      FLY_W,
        height:     FLY_H,
        left:       '0',
        top:        '0',
        transform:  'translate(0,0)',
        opacity:    '1',
        transition: 'none',
      });
      document.body.append(fly);

      // Lê dimensões reais após reflow (clamp já foi calculado pelo browser)
      const r   = fly.getBoundingClientRect();
      const hw  = r.width  / 2;
      const hh  = r.height / 2;

      // Reposiciona centrado no monte SEM transição
      fly.style.left = `${startX - hw}px`;
      fly.style.top  = `${startY - hh}px`;

      // Delta simples: sem calc(), garante interpolação CSS
      const dx = endX - startX;
      const dy = endY - startY;

      // Força segundo reflow para que o browser registre a posição inicial
      fly.getBoundingClientRect();

      // Aplica transição e move para destino
      fly.style.transition = `transform ${FLY_DURATION_MS}ms cubic-bezier(0.25,0.46,0.45,0.94), opacity 80ms ${FLY_DURATION_MS - 60}ms ease`;
      fly.style.transform  = `translate(${dx}px,${dy}px)`;
      fly.style.opacity    = '0';

      // Resolve após a duração da animação
      setTimeout(() => {
        fly.remove();
        resolve();
      }, FLY_DURATION_MS + 20);
    });
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   * @private
   */
  #wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}
