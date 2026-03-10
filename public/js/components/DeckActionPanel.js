/**
 * @layer    components
 * @group    game
 * @role     Component
 * @depends  Dom
 * @exports  DeckActionPanel
 *
 * Painel de ação abaixo do monte de cartas.
 * Gerencia três estados internos: idle → shuffling → readyToDeal.
 *
 * Se o jogador atual for o mais novo, exibe botão de ação reativo ao estado.
 * Caso contrário, exibe mensagem de aguardo reativa ao estado.
 *
 * Estados:
 *   idle        → botão "EMBARALHAR AS CARTAS" (habilitado)
 *   shuffling   → botão "EMBARALHANDO..."      (desabilitado)
 *   readyToDeal → botão "ENTREGAR CARTAS"      (habilitado)
 */

import { Dom } from '../utils/Dom.js';

/** @typedef {'idle'|'shuffling'|'readyToDeal'} PanelState */

/** Textos do botão por estado */
const BTN_TEXT = {
  idle:        'EMBARALHAR AS CARTAS',
  shuffling:   'EMBARALHANDO...',
  readyToDeal: 'ENTREGAR CARTAS',
};

/** Textos da mensagem de aguardo (jogador não-autorizado) por estado */
const WAITING_TEXT = {
  idle:        'Aguardando o jogador mais novo embaralhar as cartas...',
  shuffling:   'Aguardando o jogador mais novo embaralhar as cartas...',
  readyToDeal: 'Aguardando o jogador responsável entregar as cartas...',
};

export class DeckActionPanel {
  /** @type {string} UID do jogador atualmente logado */
  #currentUserId;

  /** @type {string} UID do jogador mais novo (responsável por embaralhar) */
  #youngestPlayerUid;

  /** @type {Function} Callback executado quando o botão é clicado */
  #onShuffleRequested;

  /** @type {PanelState} Estado visual atual do painel */
  #state = 'idle';

  /** @type {HTMLButtonElement|null} Referência ao botão (somente se autorizado) */
  #btnEl = null;

  /** @type {HTMLElement|null} Referência à mensagem (somente se não autorizado) */
  #waitingEl = null;

  /**
   * @param {string}   currentUserId      - UID do jogador logado.
   * @param {string}   youngestPlayerUid  - UID do jogador mais novo da partida.
   * @param {Function} onShuffleRequested - Callback sem argumentos chamado ao clicar.
   */
  constructor(currentUserId, youngestPlayerUid, onShuffleRequested) {
    this.#currentUserId      = currentUserId;
    this.#youngestPlayerUid  = youngestPlayerUid;
    this.#onShuffleRequested = onShuffleRequested;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Cria e retorna o elemento DOM do painel.
   * Armazena referências internas ao botão / mensagem para mutação rápida via setState().
   * @returns {HTMLElement}
   */
  create() {
    const panel = Dom.create('div', { classes: 'deck-action-panel' });

    if (this.#currentUserId === this.#youngestPlayerUid) {
      panel.append(this.#buildShuffleButton());
    } else {
      panel.append(this.#buildWaitingMessage());
    }

    return panel;
  }

  /**
   * Atualiza o estado visual do painel sem recriar o DOM.
   * Muta diretamente o textContent e o atributo disabled do botão,
   * ou o textContent da mensagem de aguardo.
   * @param {PanelState} state
   */
  setState(state) {
    this.#state = state;

    if (this.#btnEl) {
      this.#btnEl.textContent = BTN_TEXT[state];
      this.#btnEl.disabled    = state === 'shuffling';
    }

    if (this.#waitingEl) {
      this.#waitingEl.textContent = WAITING_TEXT[state];
    }

    console.log(`[DeckAction] state=${state}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Constrói o botão de embaralhar (apenas para o jogador mais novo).
   * Guarda referência em #btnEl para mutação posterior via setState().
   * @returns {HTMLButtonElement}
   */
  #buildShuffleButton() {
    const btn = Dom.create('button', {
      classes: 'deck-action-panel__btn',
      text:    BTN_TEXT[this.#state],
      attrs:   { type: 'button' },
    });

    btn.addEventListener('click', () => this.#onShuffleRequested());

    this.#btnEl = btn;
    return btn;
  }

  /**
   * Constrói a mensagem de aguardo (para os demais jogadores).
   * Guarda referência em #waitingEl para mutação posterior via setState().
   * @returns {HTMLElement}
   */
  #buildWaitingMessage() {
    const p = Dom.create('p', {
      classes: 'deck-action-panel__waiting',
      text:    WAITING_TEXT[this.#state],
    });

    this.#waitingEl = p;
    return p;
  }
}
