/**
 * @layer domain
 * @group game
 * @role Model
 * @depends PlayerSeat
 * @exports TableLayout
 *
 * Modelo que representa o layout completo da mesa de jogo.
 * Contém a quantidade de jogadores e seus respectivos assentos.
 */

import { PlayerSeat } from './PlayerSeat.js';

export class TableLayout {
  /** @type {number} Quantidade total de jogadores na mesa (2..6) */
  #playersCount;

  /** @type {PlayerSeat[]} Array de assentos ordenados por seatIndex */
  #seats;

  /**
   * @param {number} playersCount
   * @param {PlayerSeat[]} [seats=[]]
   */
  constructor(playersCount, seats = []) {
    this.#playersCount = playersCount;
    this.#seats = seats;
  }

  /** @returns {number} */
  get playersCount() { return this.#playersCount; }

  /** @returns {PlayerSeat[]} Retorna cópia do array de assentos */
  get seats() { return [...this.#seats]; }

  /**
   * Encontra um assento pelo seu índice.
   * @param {number} index
   * @returns {PlayerSeat|undefined}
   */
  getSeatByIndex(index) {
    return this.#seats.find(seat => seat.seatIndex === index);
  }

  /**
   * Encontra um assento pelo UID do jogador.
   * @param {string} uid
   * @returns {PlayerSeat|undefined}
   */
  getSeatByUid(uid) {
    return this.#seats.find(seat => seat.uid === uid);
  }

  /**
   * Retorna o total de assentos preenchidos.
   * @returns {number}
   */
  getTotalSeats() {
    return this.#seats.length;
  }
}
