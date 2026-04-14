/**
 * @layer    components
 * @group    game
 * @role     Component
 * @depends  Dom
 * @exports  CenterPileView
 *
 * Monte central onde as cartas são descartadas durante o jogo (Deu Mico).
 *
 * Estado inicial: 2 camadas de fundo + 1 carta de topo, todas com carta_verso.png.
 * Ao jogar uma carta, chame showCard(imageName) para revelar a face.
 *
 * API pública:
 *   create()               → HTMLElement — inserir no DOM manualmente
 *   showCard(imageName)    → revela a face da carta no topo (ex: 'carta_leao.png')
 *   reset()                → volta ao estado face-down (carta_verso)
 *   updateCount(count)     → atualiza o badge numérico abaixo do monte
 */

import { Dom } from '../utils/Dom.js';

export class CenterPileView {
  /** @type {number} */
  #cardCount;

  /** @type {HTMLImageElement|null} Carta do topo (face-down ou face-up) */
  #topCardEl = null;

  /**
   * @param {number} [cardCount=0]
   */
  constructor(cardCount = 0) {
    this.#cardCount = cardCount;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Cria o elemento DOM do monte central.
   * @returns {HTMLElement}
   */
  create() {
    const wrapper = Dom.create('div', { classes: 'center-pile-view' });

    // Imagem única do topo — verso por padrão
    const img = /** @type {HTMLImageElement} */ (document.createElement('img'));
    img.src = 'img/carta_verso.png';
    img.alt = 'carta';
    img.draggable = false;
    img.className = 'center-pile-view__card';
    this.#topCardEl = img;
    wrapper.append(img);

    return wrapper;
  }

  /**
   * Exibe a face de uma carta no topo da pilha central.
   * @param {string} imageName  Nome do arquivo, ex: 'carta_leao.png'.
   */
  showCard(imageName) {
    if (!this.#topCardEl || !imageName) return;
    this.#topCardEl.src = `img/${imageName}`;
    this.#topCardEl.classList.add('center-pile-view__card--revealed');
  }

  /**
   * Volta a carta do topo para o verso (estado face-down).
   */
  reset() {
    if (!this.#topCardEl) return;
    this.#topCardEl.src = 'img/carta_verso.png';
    this.#topCardEl.classList.remove('center-pile-view__card--revealed');
  }

  /**
   * Mantido por compatibilidade — sem badge visual.
   * @param {number} count
   */
  updateCount(count) {
    this.#cardCount = count;
  }
}
