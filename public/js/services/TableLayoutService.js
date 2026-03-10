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
   * EI: Garante que myUid sempre fica em "bottom" (seatIndex 0).
   * Demais jogadores são ordenados por joinedAt (ou uid como fallback).
   *
   * @param {Object[]} players - Array de jogadores {uid, name, avatarUrl, joinedAt?}
   * @param {string} myUid - UID do jogador logado (sempre será "bottom")
   * @param {number} playersCount - Quantidade esperada de jogadores (2..6)
   * @returns {TableLayout}
   * @throws {Error} Se myUid não está em players ou playersCount inválido
   */
  createLayout(players, myUid, playersCount) {
    // Validações
    if (!GameRoomType.isValid(`${playersCount}p`)) {
      throw new Error(`playersCount inválido: ${playersCount}. Deve ser 2-6.`);
    }

    if (!Array.isArray(players) || players.length === 0) {
      throw new Error('Array de players não pode estar vazio.');
    }

    const myPlayer = players.find(p => p.uid === myUid);
    if (!myPlayer) {
      throw new Error(`myUid "${myUid}" não encontrado em players.`);
    }

    if (players.length !== playersCount) {
      console.warn(
        `[TableLayoutService] players.length (${players.length}) !== playersCount (${playersCount})`
      );
    }

    // Ordena outros jogadores (excluindo myUid) por joinedAt, depois uid
    const otherPlayers = players
      .filter(p => p.uid !== myUid)
      .sort((a, b) => {
        if (a.joinedAt && b.joinedAt) {
          return a.joinedAt - b.joinedAt;
        }
        return (a.uid || '').localeCompare(b.uid || '');
      });

    // Cria os assentos conforme quantidade
    const seats = this.#generateSeats(myPlayer, otherPlayers, playersCount);

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
