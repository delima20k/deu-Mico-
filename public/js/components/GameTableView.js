/**
 * @layer components
 * @group game
 * @role Component
 * @depends TableBackground, PlayerBadge, PlayerScoreBadge, CardsHandView, CenterPileView, TournamentBadge, Dom, TableLayout
 * @exports GameTableView
 *
 * Container principal da mesa de jogo.
 * Renderiza fundo, badges de jogadores posicionados, monte central e mão do jogador.
 * Suporte a modo tournament com exibição de pontuação.
 * Layout responsivo Mobile-first.
 */

import { Dom } from '../utils/Dom.js';
import { TableBackground } from './TableBackground.js';
import { PlayerBadge } from './PlayerBadge.js';
import { PlayerScoreBadge } from './PlayerScoreBadge.js';
import { CardsHandView } from './CardsHandView.js';
import { CenterPileView } from './CenterPileView.js';
import { TournamentBadge } from './TournamentBadge.js';

export class GameTableView {
  /** @type {import('../domain/TableLayout.js').TableLayout} */
  #tableLayout;

  /** @type {string} UID do jogador logado */
  #myUid;

  /** @type {string} Tipo de sala (2p, 3p, ..., tournament) */
  #roomType;

  /** @type {HTMLElement|null} Container dos badges — fica FORA do inner do hex */
  #playersContainer = null;

  /**
   * @param {import('../domain/TableLayout.js').TableLayout} tableLayout
   * @param {string} myUid
   * @param {string} [roomType='2p']
   */
  constructor(tableLayout, myUid, roomType = '2p') {
    this.#tableLayout = tableLayout;
    this.#myUid = myUid;
    this.#roomType = roomType;
  }

  /**
   * Cria a mesa completa.
   * O container de players NÃO é inserido no wrapper — deve ser
   * obtido via getPlayersContainer() e inserido pelo chamador
   * como filho direto do .hex-table (fora do .hex-table__inner)
   * para escapar do stacking context criado por transform: scale().
   * @returns {HTMLElement}
   */
  create() {
    const wrapper = Dom.create('div', {
      classes: ['game-table-view', this.#roomType === 'tournament' ? 'game-table-view--tournament' : '']
    });

    // Fundo da mesa
    const bgComponent = new TableBackground();
    const bgEl = bgComponent.create();
    wrapper.append(bgEl);

    // Badge de CAMPEONATO (apenas em tournament)
    if (this.#roomType === 'tournament') {
      const tournamentBadgeComponent = new TournamentBadge();
      const tournamentBadgeEl = tournamentBadgeComponent.create();
      wrapper.append(tournamentBadgeEl);
    }

    // Constrói container de badges mas NÃO insere no wrapper
    // (será inserido pelo GameTableScreen diretamente no .hex-table)
    // Classe extra com nº de jogadores para permitir CSS scoping por layout
    const roomTypeClass = this.#roomType !== 'tournament'
      ? `game-table-view__players--${this.#roomType}`
      : '';
    this.#playersContainer = Dom.create('div', {
      classes: ['game-table-view__players', roomTypeClass].filter(Boolean)
    });

    // Renderiza os badges de cada jogador
    this.#tableLayout.seats.forEach(seat => {
      const isMe = seat.uid === this.#myUid;

      let badgeComponent;
      if (this.#roomType === 'tournament') {
        badgeComponent = new PlayerScoreBadge(
          seat.uid,
          seat.name,
          seat.avatarUrl,
          seat.positionKey,
          isMe,
          seat.score || 0
        );
      } else {
        badgeComponent = new PlayerBadge(
          seat.uid,
          seat.name,
          seat.avatarUrl,
          seat.positionKey,
          isMe
        );
      }

      this.#playersContainer.append(badgeComponent.create());
    });

    // Monitor central (monte de cartas)
    const centerPileComponent = new CenterPileView(0);
    const centerEl = centerPileComponent.create();
    wrapper.append(centerEl);

    // Mão do jogador (embaixo)
    const handComponent = new CardsHandView(5);
    const handEl = handComponent.create();
    wrapper.append(handEl);

    return wrapper;
  }

  /**
   * Retorna o container de badges dos jogadores.
   * Deve ser inserido como filho direto do .hex-table pelo chamador,
   * FORA do .hex-table__inner, para não ser limitado pelo seu stacking context.
   * Chamar somente após create().
   * @returns {HTMLElement|null}
   */
  getPlayersContainer() {
    return this.#playersContainer;
  }
}
