/**
 * @layer    services
 * @group    game
 * @role     Controller
 * @depends  Player, CardDeckPile, DeckActionPanel
 * @exports  ShuffleController
 *
 * Controla o fluxo completo de embaralhamento na mesa de jogo.
 *
 * Responsabilidades:
 *  - Verificar se o jogador logado é autorizado a embaralhar.
 *  - Bloquear ações não autorizadas e exibir aviso via DeckActionPanel.
 *  - Orquestrar a sequência: idle → shuffling → readyToDeal.
 *  - Proteger contra múltiplos embaralhamentos simultâneos (spam lock).
 *  - Delegar a animação ao CardDeckPile (que usa DeckShuffleAnimator internamente).
 *
 * Separação de responsabilidades:
 *  - ShuffleController NÃO manipula DOM diretamente.
 *  - ShuffleController NÃO conhece a animação CSS — apenas chama a API do pile.
 *  - ShuffleController NÃO cria o DeckActionPanel — recebe referência pronta.
 *
 * @example
 *   const controller = new ShuffleController({
 *     deckPile:       this.#deckPile,
 *     actionPanel:    this.#deckActionPanel,
 *     myUid:          this.#myUid,
 *     youngestPlayer: dealerResult.youngestPlayer,
 *   });
 *
 *   // Passa como callback do DeckActionPanel:
 *   () => controller.onShuffleRequested()
 */

import { Player } from '../domain/Player.js';

export class ShuffleController {
  /**
   * @type {import('../components/CardDeckPile.js').default}
   */
  #deckPile;

  /**
   * @type {import('../components/DeckActionPanel.js').DeckActionPanel}
   */
  #actionPanel;

  /** @type {string} UID do jogador logado neste cliente */
  #myUid;

  /** @type {Player} Jogador mais novo — único autorizado a embaralhar */
  #youngestPlayer;

  /** @type {boolean} Spam lock — impede embaralhamentos simultâneos */
  #isShuffling = false;

  // ─────────────────────────────────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {Object} params
   * @param {import('../components/CardDeckPile.js').default}       params.deckPile
   * @param {import('../components/DeckActionPanel.js').DeckActionPanel} params.actionPanel
   * @param {string} params.myUid           - UID do jogador logado.
   * @param {Player} params.youngestPlayer  - Jogador mais novo calculado pelo resolver.
   */
  constructor({ deckPile, actionPanel, myUid, youngestPlayer }) {
    if (!deckPile)       throw new Error('[ShuffleController] deckPile é obrigatório.');
    if (!actionPanel)    throw new Error('[ShuffleController] actionPanel é obrigatório.');
    if (!myUid)          throw new Error('[ShuffleController] myUid é obrigatório.');
    if (!youngestPlayer) throw new Error('[ShuffleController] youngestPlayer é obrigatório.');

    this.#deckPile       = deckPile;
    this.#actionPanel    = actionPanel;
    this.#myUid          = myUid;
    this.#youngestPlayer = youngestPlayer;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * `true` se o jogador atual é o dealer (autorizado a embaralhar).
   * @returns {boolean}
   */
  get isAuthorized() {
    return this.#myUid === this.#youngestPlayer.id;
  }

  /**
   * Dealer da rodada atual.
   * @returns {Player}
   */
  get youngestPlayer() {
    return this.#youngestPlayer;
  }

  /**
   * Entry-point de clique no botão "EMBARALHAR".
   * Deve ser passado como callback ao DeckActionPanel:
   *   `() => controller.onShuffleRequested()`
   *
   * Fluxo:
   *   1. Spam lock — ignora se já embaralhando.
   *   2. Verificação de autorização — exibe toast e aborta se não autorizado.
   *   3. Inicia sequência: setState('shuffling') → animação → setState('readyToDeal').
   */
  onShuffleRequested() {
    if (this.#isShuffling) {
      console.log('[ShuffleController] ⚠️ Ignorado — embaralhamento em andamento');
      return;
    }

    if (!this.isAuthorized) {
      const msg = `Somente ${this.#youngestPlayer.name} pode embaralhar`;
      this.#actionPanel.showBlockedWarning(msg);
      console.warn(`[ShuffleController] ⛔ Acesso negado — myUid=${this.#myUid} dealer=${this.#youngestPlayer.id}`);
      return;
    }

    this.#performShuffle();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Executa a sequência completa de embaralhamento.
   * Usa async/await sem expor a Promise externamente — o caller não precisa aguardar.
   */
  async #performShuffle() {
    this.#isShuffling = true;
    console.log('[ShuffleController] 🃏 Embaralhamento iniciado');

    this.#actionPanel.setState('shuffling');

    await this.#deckPile.animateCentralDeckShuffle();

    this.#actionPanel.setState('readyToDeal');
    this.#isShuffling = false;

    console.log('[ShuffleController] ✅ Embaralhamento concluído — pronto para entregar');
  }
}
