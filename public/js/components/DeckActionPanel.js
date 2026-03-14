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
 * Todos os jogadores veem o botão de ação.
 * Somente o jogador mais novo (isAuthorized) pode ativá-lo.
 * Tentativas não autorizadas ativam o botão bloqueado (shake + toast).
 *
 * Estados:
 *   idle        → botão "EMBARALHAR"      (habilitado apenas para o dealer)
 *   shuffling   → botão "EMBARALHANDO..." (desabilitado para todos)
 *   readyToDeal → botão "ENTREGAR CARTAS" (habilitado apenas para o dealer)
 */

import { Dom } from '../utils/Dom.js';

/** @typedef {'idle'|'shuffling'|'readyToDeal'} PanelState */

/** Textos do botão por estado */
const BTN_TEXT = {
  idle:        'EMBARALHAR',
  shuffling:   'EMBARALHANDO...',
  readyToDeal: 'ENTREGAR CARTAS',
  dealing:     'ENTREGANDO...',
};

/** Textos da mensagem de aguardo (jogadores não autorizados) por estado */
const WAITING_TEXT = {
  idle:        'Aguardando o jogador mais novo embaralhar...',
  shuffling:   'Embaralhando as cartas...',
  readyToDeal: 'Aguardando a entrega das cartas...',
  dealing:     'Entregando as cartas...',
};

/** Duração do toast de bloqueio em ms */
const TOAST_DURATION_MS = 2500;

export class DeckActionPanel {
  /** @type {string} UID do jogador atualmente logado */
  #currentUserId;

  /** @type {string} UID do jogador mais novo (dealer) */
  #youngestPlayerUid;

  /** @type {string} Nome legível do dealer (exibido no toast) */
  #youngestPlayerName;

  /** @type {Function} Callback executado pelo dealer ao clicar em embaralhar */
  #onShuffleRequested;

  /** @type {Function|null} Callback executado pelo dealer ao clicar em entregar */
  #onDealRequested = null;

  /** @type {boolean} true = jogador atual é o dealer */
  #isAuthorized;

  /** @type {PanelState} Estado visual atual */
  #state = 'idle';

  /** @type {HTMLButtonElement|null} Botão ativo (dealer) */
  #btnEl = null;

  /** @type {HTMLButtonElement|null} Botão bloqueado (não-dealer) */
  #lockBtnEl = null;

  /** @type {HTMLElement|null} Mensagem de aguardo (não-dealer) */
  #waitingEl = null;

  /** @type {HTMLElement|null} Toast de aviso de ação bloqueada */
  #toastEl = null;

  /** @type {ReturnType<typeof setTimeout>|null} Timer para esconder o toast */
  #toastTimer = null;

  /**
   * @param {string}   currentUserId      - UID do jogador logado.
   * @param {string}   youngestPlayerUid  - UID do jogador mais novo da partida.
   * @param {Function} onShuffleRequested - Callback chamado quando o dealer clica em embaralhar.
   * @param {string}   [youngestPlayerName='o jogador mais novo'] - Nome exibido no toast.
   * @param {Function|null} [onDealRequested=null] - Callback chamado quando o dealer clica em entregar.
   */
  constructor(currentUserId, youngestPlayerUid, onShuffleRequested, youngestPlayerName = 'o jogador mais novo', onDealRequested = null) {
    this.#currentUserId      = currentUserId;
    this.#youngestPlayerUid  = youngestPlayerUid;
    this.#onShuffleRequested = onShuffleRequested;
    this.#youngestPlayerName = youngestPlayerName;
    this.#isAuthorized       = currentUserId === youngestPlayerUid;
    this.#onDealRequested    = onDealRequested;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Cria e retorna o elemento DOM do painel.
   * Todos os jogadores veem o botão; apenas o dealer pode ativá-lo.
   * @returns {HTMLElement}
   */
  create() {
    const panel = Dom.create('div', { classes: 'deck-action-panel' });

    // Toast — presente para ambos os fluxos, invisível por padrão
    this.#toastEl = Dom.create('p', { classes: 'deck-action-panel__toast' });
    panel.append(this.#toastEl);

    if (this.#isAuthorized) {
      // Dealer: botão ativo, chama shuffle diretamente
      panel.append(this.#buildShuffleButton());
    } else {
      // Não-dealer: botão visualmente bloqueado + mensagem de aguardo
      panel.append(this.#buildLockedButton());
      panel.append(this.#buildWaitingMessage());
    }

    return panel;
  }

  /**
   * Atualiza o estado visual do painel sem recriar o DOM.
   * Muta textContent e disabled dos elementos existentes.
   * @param {PanelState} state
   */
  setState(state) {
    this.#state = state;

    if (this.#btnEl) {
      this.#btnEl.textContent = BTN_TEXT[state];
      this.#btnEl.disabled    = state === 'shuffling' || state === 'dealing';
    }

    if (this.#lockBtnEl) {
      // Mantém aparência bloqueada — apenas replica o label por consistência visual
      this.#lockBtnEl.textContent = BTN_TEXT[state];
    }

    if (this.#waitingEl) {
      this.#waitingEl.textContent = WAITING_TEXT[state];
    }

    console.log(`[DeckAction] state=${state}`);
  }

  /**
   * Exibe um aviso toast indicando que a ação foi bloqueada.
   * Auto-oculta após TOAST_DURATION_MS.
   * Seguro chamar múltiplas vezes (reinicia o timer).
   *
   * @param {string} [message] - Mensagem personalizada.
   *   Padrão: "Somente [youngestPlayerName] pode embaralhar".
   */
  showBlockedWarning(message) {
    if (!this.#toastEl) return;

    const msg = message || `Somente ${this.#youngestPlayerName} pode embaralhar`;

    clearTimeout(this.#toastTimer);

    this.#toastEl.textContent = msg;
    this.#toastEl.classList.add('deck-action-panel__toast--visible');

    this.#toastTimer = setTimeout(() => {
      this.#toastEl.classList.remove('deck-action-panel__toast--visible');
    }, TOAST_DURATION_MS);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Constrói o botão ativo (somente para o dealer).
   * Guarda referência em #btnEl para mutação via setState().
   * @returns {HTMLButtonElement}
   */
  #buildShuffleButton() {
    const btn = Dom.create('button', {
      classes: 'deck-action-panel__btn',
      text:    BTN_TEXT[this.#state],
      attrs:   { type: 'button' },
    });

    btn.addEventListener('click', () => {
      if (this.#state === 'shuffling' || this.#state === 'dealing') return;
      if (this.#state === 'readyToDeal' && this.#onDealRequested) {
        this.#onDealRequested();
      } else {
        this.#onShuffleRequested();
      }
    });

    this.#btnEl = btn;
    return btn;
  }

  /**
   * Constrói o botão visualmente bloqueado (para jogadores não autorizados).
   * Clique aciona shake + toast de aviso.
   * @returns {HTMLButtonElement}
   */
  #buildLockedButton() {
    const btn = Dom.create('button', {
      classes: ['deck-action-panel__btn', 'deck-action-panel__btn--locked'],
      text:    BTN_TEXT[this.#state],
      attrs:   { type: 'button' },
    });

    btn.addEventListener('click', () => {
      // Reflow trick para reiniciar a animação mesmo se já está correndo
      btn.classList.remove('deck-action-panel__btn--shake');
      void btn.offsetWidth;
      btn.classList.add('deck-action-panel__btn--shake');

      this.showBlockedWarning();
    });

    this.#lockBtnEl = btn;
    return btn;
  }

  /**
   * Constrói a mensagem de aguardo (apenas para não-dealers).
   * Guarda referência em #waitingEl para mutação via setState().
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

