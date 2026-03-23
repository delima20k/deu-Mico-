/**
 * @layer    components
 * @group    game
 * @role     Component
 * @depends  Dom, CornerDebugLabel
 * @exports  HexTable
 *
 * Mesa de jogo em formato hexagonal.
 * Exibe um hexágono plano (flat-top) centralizado na tela,
 * com borda de madeira, feltro interno e 6 marcações de debug nas quinas.
 *
 * Estrutura DOM:
 *   .hex-table                         (container sem clip-path)
 *     ├── .hex-table__border           (hexágono de borda — clip-path)
 *     ├── .hex-table__inner            (feltro interno — clip-path + scale)
 *     │     └── .hex-table__slot      (área de conteúdo do jogo)
 *     └── .hex-table__corner-label--* (6× marcações de debug)
 *
 * Hexágono flat-top com aspect-ratio 2:√3.
 * clip-path: polygon(25% 6%, 75% 6%, 95% 50%, 75% 94%, 25% 94%, 5% 50%)
 */

import { Dom }             from '../utils/Dom.js';
import { CornerDebugLabel } from './CornerDebugLabel.js';

/*
 * DEBUG CORNER LABELS
 * These labels are used only during development
 * to identify hexagon corners.
 *
 * REMOVE BEFORE PRODUCTION
 */

/** @typedef {'top-left'|'top-right'|'right'|'bottom-right'|'bottom-left'|'left'} CornerKey */

/**
 * Definição das 6 quinas do hexágono flat-top.
 * positionKey corresponde à classe CSS .hex-table__corner-label--{positionKey}.
 *
 * Numeração sentido horário padronizada para AMBAS as orientações:
 *
 *  PORTRAIT (rotate 90° CW → hex fica pontudo):
 *    1 = quina de BAIXO         → CSS "left"          (5%,  50%)
 *    2 = quina BAIXO-ESQUERDA   → CSS "top-left"      (25%,  6%)
 *    3 = quina CIMA-ESQUERDA    → CSS "top-right"     (75%,  6%)
 *    4 = quina de CIMA          → CSS "right"         (95%, 50%)
 *    5 = quina CIMA-DIREITA     → CSS "bottom-right"  (75%, 94%)
 *    6 = quina BAIXO-DIREITA    → CSS "bottom-left"   (25%, 94%)
 *
 *  LANDSCAPE (0° → hex flat-top normal):
 *    1 = quina ESQUERDA         → CSS "left"          (5%,  50%)
 *    2 = quina CIMA-ESQUERDA    → CSS "top-left"      (25%,  6%)
 *    3 = quina CIMA-DIREITA     → CSS "top-right"     (75%,  6%)
 *    4 = quina DIREITA          → CSS "right"         (95%, 50%)
 *    5 = quina BAIXO-DIREITA    → CSS "bottom-right"  (75%, 94%)
 *    6 = quina BAIXO-ESQUERDA   → CSS "bottom-left"   (25%, 94%)
 *
 * @type {Array<{text: string, key: CornerKey}>}
 */
const HEX_CORNERS = [
  { text: '1', key: 'left'         },   // portrait: baixo       | landscape: esquerda
  { text: '2', key: 'top-left'     },   // portrait: baixo-esq   | landscape: cima-esq
  { text: '3', key: 'top-right'    },   // portrait: cima-esq    | landscape: cima-dir
  { text: '4', key: 'right'        },   // portrait: cima        | landscape: direita
  { text: '5', key: 'bottom-right' },   // portrait: cima-dir    | landscape: baixo-dir
  { text: '6', key: 'bottom-left'  },   // portrait: baixo-dir   | landscape: baixo-esq
];

export class HexTable {
  /** @type {HTMLElement|null} Slot de conteúdo interno da mesa */
  #slot = null;

  /** @type {HTMLElement|null} Elemento raiz do componente */
  #el = null;

  /**
   * Cria e retorna o elemento da mesa hexagonal completa.
   * @returns {HTMLElement}
   */
  create() {
    // ── Container raiz (sem clip-path — permite labels fora do hex) ──
    const root = Dom.create('div', { classes: 'hex-table' });

    // ── Camada de borda (hexágono externo — cor de madeira) ──
    const border = Dom.create('div', { classes: 'hex-table__border' });
    root.append(border);

    // ── Camada interna de feltro (hexágono escalonado) ──
    const inner = Dom.create('div', { classes: 'hex-table__inner' });

    // ── Slot para conteúdo do jogo ──
    this.#slot = Dom.create('div', { classes: 'hex-table__slot' });
    inner.append(this.#slot);

    root.append(inner);

    // ── Marcações de debug nas 6 quinas (apenas em desenvolvimento) ──
    for (const { text, key } of HEX_CORNERS) {
      const label = new CornerDebugLabel(text, key);
      root.append(label.create());
    }

    this.#el = root;
    return root;
  }

  /**
   * Retorna o slot interno onde o conteúdo do jogo deve ser inserido.
   * Chamar somente após create().
   * @returns {HTMLElement|null}
   */
  getSlot() {
    return this.#slot;
  }

  /**
   * Retorna o elemento raiz do componente.
   * Chamar somente após create().
   * @returns {HTMLElement|null}
   */
  getElement() {
    return this.#el;
  }
}
