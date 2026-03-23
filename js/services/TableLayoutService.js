/**
 * @layer services
 * @group game
 * @role Service
 * @depends TableLayout, PlayerSeat, GameRoomType
 * @exports TableLayoutService
 *
 * Serviço que cria layouts de mesa de jogo (2p até 6p) conforme quantidade de jogadores.
 * Garante que o usuário logado (myUid) sempre fica no assento "bottom" (posição 0).
 * Implementa Singleton.
 */

import { TableLayout } from '../domain/TableLayout.js';
import { PlayerSeat } from '../domain/PlayerSeat.js';
import { GameRoomType } from '../domain/GameRoomType.js';

/**
 * Posições no sentido anti-horário a partir de 'bottom' (excluindo bottom),
 * para cada quantidade de jogadores.
 * Índice 0 = imediatamente à ESQUERDA de bottom (1 passo CCW), avançando CCW.
 *
 * Topologia do relógio:
 *  2p : bottom(6h) → top(12h)
 *  3p : bottom(6h) → top-left(10h) → top-right(2h)
 *  4p : bottom(6h) → left(9h) → top(12h) → right(3h)
 *  5p : bottom(6h) → mid-left(8.4h) → upper-left(10.8h) → upper-right(1.2h) → mid-right(3.6h)
 *  6p : bottom(6h) → bottom-left(8h) → top-left(10h) → top(12h) → top-right(2h) → bottom-right(4h)
 */
const CCW_POSITIONS = {
  2: ['top'],
  3: ['top-left', 'top-right'],
  4: ['left', 'top', 'right'],
  5: ['mid-left', 'upper-left', 'upper-right', 'mid-right'],
  6: ['bottom-left', 'top-left', 'top', 'top-right', 'bottom-right'],
};

export class TableLayoutService {
  /** @type {TableLayoutService|null} */
  static #instance = null;

  /**
   * Obtém a instância única do serviço (Singleton).
   * @returns {TableLayoutService}
   */
  static getInstance() {
    if (this.#instance === null) {
      this.#instance = new TableLayoutService();
    }
    return this.#instance;
  }

  constructor() {
    if (TableLayoutService.#instance !== null) {
      throw new Error('TableLayoutService é Singleton. Use getInstance()');
    }
  }

  /**
   * Gera um TableLayout com base nos jogadores atuais.
   * Garante que myUid sempre fica em "bottom" (posição 6h).
   * Os demais são posicionados no sentido anti-horário conforme a ordem
   * em que entraram na sala (joinedAt), de forma que cada jogador sempre
   * fica à esquerda do anterior.
   *
   * Algoritmo rotacional:
   *   1. Ordena TODOS por joinedAt (fallback: índice no array).
   *   2. Encontra myJoinIdx = posição do jogador local nessa ordem.
   *   3. Para cada jogador k: relIdx = (k − myJoinIdx + N) % N.
   *   4. relIdx 0 = eu (bottom); relIdx 1..N-1 mapeiam CCW_POSITIONS.
   *
   * @param {Object[]} players - Array de jogadores {uid, name, avatarUrl, joinedAt?}
   * @param {string} myUid - UID do jogador logado
   * @param {number} playersCount - Quantidade esperada de jogadores (2..6)
   * @returns {TableLayout}
   */
  createLayout(players, myUid, playersCount) {
    if (!GameRoomType.isValid(`${playersCount}p`)) {
      throw new Error(`playersCount inválido: ${playersCount}. Deve ser 2-6.`);
    }
    if (!Array.isArray(players) || players.length === 0) {
      throw new Error('Array de players não pode estar vazio.');
    }
    if (!players.find(p => p.uid === myUid)) {
      throw new Error(`myUid "${myUid}" não encontrado em players.`);
    }
    if (players.length !== playersCount) {
      console.warn(
        `[TableLayoutService] players.length (${players.length}) !== playersCount (${playersCount})`
      );
    }

    // 1. Ordena todos por joinedAt; tie-break pelo índice original no array
    const allSorted = players
      .map((p, i) => ({ ...p, _arrayIdx: i }))
      .sort((a, b) => {
        const tA = a.joinedAt ?? 0;
        const tB = b.joinedAt ?? 0;
        if (tA !== tB) return tA - tB;
        return a._arrayIdx - b._arrayIdx;
      });

    const N         = allSorted.length;
    const myJoinIdx = allSorted.findIndex(p => p.uid === myUid);
    const ccwPos    = CCW_POSITIONS[playersCount] ?? [];

    // 2. Gera assentos na ordem de join: relIdx dá a posição CCW relativa a mim
    const seats = [];
    for (let k = 0; k < N; k++) {
      const p      = allSorted[k];
      const relIdx = (k - myJoinIdx + N) % N;

      if (relIdx === 0) {
        // Sou eu — sempre bottom
        seats.push(new PlayerSeat(p.uid, p.name, p.avatarUrl || null, 0, 'bottom', p.score || 0));
      } else {
        // Outro jogador: CCW_POSITIONS[relIdx - 1]
        const posKey = ccwPos[relIdx - 1] || 'top';
        seats.push(new PlayerSeat(p.uid, p.name, p.avatarUrl || null, relIdx, posKey, p.score || 0));
      }
    }

    // Loga o layout para debug
    seats.forEach(s => console.log(`  [TableLayout] ${s.name} → ${s.positionKey} (relIdx=${s.seatIndex})`) );

    return new TableLayout(playersCount, seats);
  }

  /**
   * Gera array de PlayerSeat conforme a quantidade de jogadores.
   * @private
   * @param {Object} myPlayer - Dados do jogador logado
   * @param {Object[]} otherPlayers - Array de outros jogadores (já ordenado)
   * @param {number} playersCount
   * @returns {PlayerSeat[]}
   */
  #generateSeats(myPlayer, otherPlayers, playersCount) {
    const seats = [];

    // Assento 0 sempre é "bottom" (o jogador logado)
    seats.push(
      new PlayerSeat(
        myPlayer.uid,
        myPlayer.name,
        myPlayer.avatarUrl || null,
        0,
        'bottom',
        myPlayer.score || 0  // Suporta score para tournament
      )
    );

    // Gera os demais assentos conforme quantidade
    switch (playersCount) {
      case 2:
        return this.#generate2p(seats, otherPlayers);
      case 3:
        return this.#generate3p(seats, otherPlayers);
      case 4:
        return this.#generate4p(seats, otherPlayers);
      case 5:
        return this.#generate5p(seats, otherPlayers);
      case 6:
        return this.#generate6p(seats, otherPlayers);
      default:
        return seats;
    }
  }

  /**
   * Layout para 2 jogadores:
   * - Me: bottom
   * - Outro: top
   * @private
   */
  #generate2p(seats, otherPlayers) {
    if (otherPlayers.length > 0) {
      const p = otherPlayers[0];
      seats.push(
        new PlayerSeat(p.uid, p.name, p.avatarUrl || null, 1, 'top', p.score || 0)
      );
    }
    return seats;
  }

  /**
   * Layout para 3 jogadores:
   * - Me: bottom
   * - Outro1: top-left
   * - Outro2: top-right
   * @private
   */
  #generate3p(seats, otherPlayers) {
    const positions = ['top-left', 'top-right'];
    otherPlayers.forEach((p, idx) => {
      seats.push(
        new PlayerSeat(
          p.uid,
          p.name,
          p.avatarUrl || null,
          idx + 1,
          positions[idx] || 'top',
          p.score || 0
        )
      );
    });
    return seats;
  }

  /**
   * Layout para 4 jogadores:
   * - Me: bottom
   * - Outro1: top
   * - Outro2: left
   * - Outro3: right
   * @private
   */
  #generate4p(seats, otherPlayers) {
    const positions = ['top', 'left', 'right'];
    otherPlayers.forEach((p, idx) => {
      seats.push(
        new PlayerSeat(
          p.uid,
          p.name,
          p.avatarUrl || null,
          idx + 1,
          positions[idx] || 'top',
          p.score || 0
        )
      );
    });
    return seats;
  }

  /**
   * Layout para 5 jogadores:
   * - Me: bottom
   * - Outro1: upper-left
   * - Outro2: mid-left
   * - Outro3: upper-right
   * - Outro4: mid-right
   * @private
   */
  #generate5p(seats, otherPlayers) {
    const positions = ['upper-left', 'mid-left', 'upper-right', 'mid-right'];
    otherPlayers.forEach((p, idx) => {
      seats.push(
        new PlayerSeat(
          p.uid,
          p.name,
          p.avatarUrl || null,
          idx + 1,
          positions[idx] || 'top',
          p.score || 0
        )
      );
    });
    return seats;
  }

  /**
   * Layout para 6 jogadores:
   * - Me: bottom
   * - Outro1: bottom-left
   * - Outro2: bottom-right
   * - Outro3: top
   * - Outro4: top-left
   * - Outro5: top-right
   * @private
   */
  #generate6p(seats, otherPlayers) {
    const positions = [
      'bottom-left',
      'bottom-right',
      'top',
      'top-left',
      'top-right'
    ];
    otherPlayers.forEach((p, idx) => {
      seats.push(
        new PlayerSeat(
          p.uid,
          p.name,
          p.avatarUrl || null,
          idx + 1,
          positions[idx] || 'top',
          p.score || 0
        )
      );
    });
    return seats;
  }
}
