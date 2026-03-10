/**
 * @layer domain
 * @group matchmaking
 * @role Entity
 * @depends LobbyType
 * @exports Match
 *
 * Entity: Representa uma partida individual.
 * Encapsula estado, metadados e regras de negócio da partida.
 * Puro domínio — sem Firebase.
 */

export class Match {
  /** @type {string} */
  #matchId;

  /** @type {LobbyType} */
  #lobbyType;

  /** @type {string[]} */
  #playerIds;

  /** @type {string} */
  #state; // 'waiting' | 'started' | 'finished'

  /** @type {number} */
  #createdTs;

  /** @type {number} */
  #startedTs;

  /** @type {Object} */
  #meta;

  /**
   * @param {Object} config
   * @param {string} config.matchId - ID único da partida
   * @param {LobbyType} config.lobbyType - Tipo de lobby
   * @param {string[]} config.playerIds - IDs dos jogadores
   * @param {number} [config.createdTs] - Timestamp de criação (opcional)
   */
  constructor({ matchId, lobbyType, playerIds, createdTs = Date.now() }) {
    this.#matchId = matchId;
    this.#lobbyType = lobbyType;
    this.#playerIds = playerIds || [];
    this.#state = 'waiting';
    this.#createdTs = createdTs;
    this.#startedTs = null;
    this.#meta = {};
  }

  /**
   * Retorna o ID da partida.
   * @returns {string}
   */
  getMatchId() {
    return this.#matchId;
  }

  /**
   * Retorna o tipo de lobby.
   * @returns {LobbyType}
   */
  getLobbyType() {
    return this.#lobbyType;
  }

  /**
   * Retorna lista de IDs de jogadores.
   * @returns {string[]}
   */
  getPlayerIds() {
    return [...this.#playerIds];
  }

  /**
   * Retorna a quantidade de jogadores.
   * @returns {number}
   */
  getPlayerCount() {
    return this.#playerIds.length;
  }

  /**
   * Adiciona um jogador à partida.
   * @param {string} playerId
   */
  addPlayer(playerId) {
    if (!this.#playerIds.includes(playerId)) {
      this.#playerIds.push(playerId);
    }
  }

  /**
   * Remove um jogador da partida.
   * @param {string} playerId
   */
  removePlayer(playerId) {
    this.#playerIds = this.#playerIds.filter(id => id !== playerId);
  }

  /**
   * Verifica se um jogador está na partida.
   * @param {string} playerId
   * @returns {boolean}
   */
  hasPlayer(playerId) {
    return this.#playerIds.includes(playerId);
  }

  /**
   * Retorna o estado da partida.
   * @returns {string}
   */
  getState() {
    return this.#state;
  }

  /**
   * Define o estado da partida.
   * @param {string} state
   */
  setState(state) {
    this.#state = state;
  }

  /**
   * Marca a partida como iniciada.
   */
  markStarted() {
    this.#state = 'started';
    this.#startedTs = Date.now();
  }

  /**
   * Marca a partida como finalizada.
   */
  markFinished() {
    this.#state = 'finished';
  }

  /**
   * Retorna o timestamp de criação.
   * @returns {number}
   */
  getCreatedTs() {
    return this.#createdTs;
  }

  /**
   * Retorna o timestamp de início (ou null).
   * @returns {number|null}
   */
  getStartedTs() {
    return this.#startedTs;
  }

  /**
   * Define metadados da partida.
   * @param {Object} meta
   */
  setMeta(meta) {
    this.#meta = { ...meta };
  }

  /**
   * Retorna metadados da partida.
   * @returns {Object}
   */
  getMeta() {
    return { ...this.#meta };
  }
}
