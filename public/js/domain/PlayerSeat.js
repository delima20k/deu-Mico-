/**
 * @layer domain
 * @group game
 * @role Model
 * @depends none
 * @exports PlayerSeat
 *
 * Modelo que representa um assento (seat) específico de um jogador na mesa.
 * Contém informações de identificação, posição lógica, visual e pontuação (tournament).
 */

export class PlayerSeat {
  /** @type {string} Firebase UID do jogador */
  #uid;

  /** @type {string} Nome exibição do jogador */
  #name;

  /** @type {string|null} URL do avatar */
  #avatarUrl;

  /** @type {number} Índice do assento (0 = eu, depois ordenado) */
  #seatIndex;

  /** @type {string} Chave de posição visual na mesa (bottom, top, left, etc) */
  #positionKey;

  /** @type {number} Pontuação do jogador (tournament mode) */
  #score;

  /**
   * @param {string} uid
   * @param {string} name
   * @param {string|null} avatarUrl
   * @param {number} seatIndex
   * @param {string} positionKey
   * @param {number} [score=0]
   */
  constructor(uid, name, avatarUrl, seatIndex, positionKey, score = 0) {
    this.#uid = uid;
    this.#name = name;
    this.#avatarUrl = avatarUrl;
    this.#seatIndex = seatIndex;
    this.#positionKey = positionKey;
    this.#score = score;
  }

  /** @returns {string} */
  get uid() { return this.#uid; }

  /** @returns {string} */
  get name() { return this.#name; }

  /** @returns {string|null} */
  get avatarUrl() { return this.#avatarUrl; }

  /** @returns {number} */
  get seatIndex() { return this.#seatIndex; }

  /** @returns {string} */
  get positionKey() { return this.#positionKey; }

  /** @returns {number} */
  get score() { return this.#score; }
}
