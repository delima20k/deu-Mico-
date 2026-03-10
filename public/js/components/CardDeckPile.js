/**
 * @layer components
 * @group game
 * @role Component
 * @depends Dom
 * @exports CardDeckPile
 *
 * Monte de cartas empilhadas no centro da mesa.
 *
 * Visual: 6 camadas visíveis com deslocamento e rotação suave,
 * simulando um baralho físico real. O topo exibe glow dourado sutil.
 * Badge abaixo do monte mostra a contagem de cartas restantes.
 *
 * API principal:
 *   create()                          → HTMLElement (inserir manualmente)
 *   render()                          → insere no tableElement
 *   renderCentralDeck(deck)           → sincroniza contagem com deck real
 *   updateCentralDeckCount(count)     → atualiza apenas o badge
 *   getPosition()                     → { centerX, centerY } do elemento
 *   shuffleAnimation()                → reservado para fase futura
 */

import { Dom } from '../utils/Dom.js';

// ─── Constantes visuais ────────────────────────────────────────────────────

/** Camadas visíveis da pilha (4–8 recomendado). */
const VISIBLE_LAYERS = 6;

/** Deslocamento máximo em X por camada (px). */
const MAX_OFFSET_X = 2.5;

/** Deslocamento máximo em Y por camada (px). */
const MAX_OFFSET_Y = 2.5;

/** Rotação máxima por camada (graus). */
const MAX_ROTATION = 2.0;

/**
 * Padrões determinísticos de deslocamento X (px) por índice de camada.
 * Cicla sobre o array — determinístico para parecer organizado.
 * @type {number[]}
 */
const OFFSET_X_PATTERN = [
   0.0,  1.2, -1.2,  2.0, -2.0,  1.5,
  -1.5,  0.8, -0.8,  2.5, -2.5,  0.4,
];

/**
 * Padrões determinísticos de deslocamento Y (px) por índice.
 * Espelhado de X para criar profundidade diagonal cruzada.
 * @type {number[]}
 */
const OFFSET_Y_PATTERN = [
   0.0, -1.2,  1.2, -2.0,  2.0, -1.5,
   1.5, -0.8,  0.8, -2.5,  2.5, -0.4,
];

/**
 * Padrões de rotação (graus) por índice.
 * ±MAX_ROTATION oscilando suavemente para simular um baralho real.
 * @type {number[]}
 */
const ROTATION_PATTERN = [
   0.0,  0.6, -0.6,  1.2, -1.2,  1.8,
  -1.8,  2.0, -2.0,  0.4, -0.4,  0.9,
];

// ──────────────────────────────────────────────────────────────────────────

export default class CardDeckPile {
  /** @type {HTMLElement} Elemento da mesa onde o monte será inserido */
  #tableElement;

  /** @type {HTMLElement|null} Raiz do monte (.card-deck-pile) */
  #containerEl = null;

  /** @type {HTMLElement|null} Badge de contagem */
  #countEl = null;

  /** @type {number} Contagem atual de cartas no monte */
  #currentCount = 0;

  /**
   * @param {HTMLElement} tableElement - Elemento pai da mesa (game-table-view).
   */
  constructor(tableElement) {
    this.#tableElement = tableElement;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Cria o DOM do monte sem inserir na página.
   * @returns {HTMLElement} .card-deck-pile pronto para insertir.
   */
  create() {
    const container = Dom.create('div', { classes: 'card-deck-pile' });

    // Constrói as camadas visuais (fundo → topo)
    for (let i = 0; i < VISIBLE_LAYERS; i++) {
      container.append(this.#buildLayer(i));
    }

    // Badge de contagem
    this.#countEl = Dom.create('div', { classes: 'card-deck-pile__count' });
    container.append(this.#countEl);

    this.#containerEl = container;
    return container;
  }

  /**
   * Cria e insere o monte no tableElement.
   * Pode ser chamado independentemente de create().
   */
  render() {
    const el = this.#containerEl ?? this.create();
    this.#tableElement.append(el);
    console.log('[CardDeckPile] ✅ Monte renderizado no centro da mesa');
    console.log(`[CardDeckPile] 🃏 Camadas visíveis: ${VISIBLE_LAYERS}`);
  }

  /**
   * Sincroniza o componente visual com o deck de jogo real.
   * Atualiza contagem e estado vazio/cheio.
   *
   * @param {import('../domain/Card.js').Card[]|null} deck - Array de cartas restantes.
   *   Pode ser null/undefined para usar contagem padrão (69).
   */
  renderCentralDeck(deck) {
    const count = Array.isArray(deck) ? deck.length : 69;
    this.updateCentralDeckCount(count);
    console.log(`[CardDeckPile] 🔄 Deck sincronizado: ${count} cartas`);
  }

  /**
   * Atualiza apenas o badge de contagem de cartas.
   * Não re-renderiza as camadas — operação leve, O(1).
   *
   * @param {number} count - Quantidade de cartas restantes no monte.
   */
  updateCentralDeckCount(count) {
    this.#currentCount = count;

    if (!this.#countEl) return;

    // Atualiza texto do badge
    this.#countEl.textContent = count > 0 ? String(count) : '';

    // Toggle de estado vazio
    this.#containerEl?.classList.toggle('card-deck-pile--empty', count === 0);
  }

  /**
   * Animação de embaralhar — reservado para fase futura.
   */
  shuffleAnimation() {
    // TODO: implementar animação de embaralhar (DeckShuffleAnimator)
  }

  /**
   * Retorna o centro geométrico do tableElement no viewport.
   * Deve ser chamado com o elemento visível na tela.
   * @returns {{ centerX: number, centerY: number }|null}
   */
  getPosition() {
    if (!this.#tableElement) return null;
    const rect = this.#tableElement.getBoundingClientRect();
    return {
      centerX: rect.left + rect.width  / 2,
      centerY: rect.top  + rect.height / 2,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Constrói uma camada visual da pilha.
   *
   * index 0          = camada do fundo (z-index mais baixo)
   * index VISIBLE_LAYERS-1 = topo da pilha (recebe .card-back--top)
   *
   * @param {number} index
   * @returns {HTMLElement}
   */
  #buildLayer(index) {
    const isTop   = index === VISIBLE_LAYERS - 1;
    const classes = isTop ? ['card-back', 'card-back--top'] : ['card-back'];
    const card    = Dom.create('div', { classes });

    const ox  = OFFSET_X_PATTERN [index % OFFSET_X_PATTERN.length];
    const oy  = OFFSET_Y_PATTERN [index % OFFSET_Y_PATTERN.length];
    const rot = ROTATION_PATTERN [index % ROTATION_PATTERN.length];

    // Aplica transform via CSS — GPU-accelerated
    card.style.transform = `translate(${ox}px, ${oy}px) rotate(${rot}deg)`;

    // z-index crescente: topo da pilha renderiza por cima
    card.style.zIndex = String(index + 1);

    return card;
  }
}
