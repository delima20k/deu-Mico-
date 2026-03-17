/**
 * @layer domain
 * @group matchmaking
 * @role ValueObject
 * @depends none
 * @exports LobbyType
 *
 * Value Object: Define tipos de lobby (2p, 3p, 4p, 5p, 6p, multi).
 * Encapsula validação de tipos de fila.
 * Puro domínio — sem Firebase.
 */

export class LobbyType {
  /** @type {string} */
  #type;

  /** @type {number|null} */
  #minPlayers;

  /** @type {number} */
  #maxPlayers;

  /**
   * @param {string} type - Tipo de lobby: '2p', '3p', '4p', '5p', '6p', 'multi'
   */
  constructor(type) {
    this.#type = type;
    this.#initializeRules();
  }

  /**
   * Inicializa regras de jogadores por tipo.
   * @private
   */
  #initializeRules() {
    const rules = {
      '2p': { minPlayers: 2, maxPlayers: 2 },
      '3p': { minPlayers: 3, maxPlayers: 3 },
      '4p': { minPlayers: 4, maxPlayers: 4 },
      '5p': { minPlayers: 5, maxPlayers: 5 },
      '6p': { minPlayers: 6, maxPlayers: 6 },
      'multi':      { minPlayers: 2, maxPlayers: null }, // sem máximo
      'tournament': { minPlayers: 2, maxPlayers: null }, // alias de multi
    };

    const rule = rules[this.#type];
    if (!rule) {
      throw new Error(`[LobbyType] Tipo desconhecido: ${this.#type}`);
    }

    this.#minPlayers = rule.minPlayers;
    this.#maxPlayers = rule.maxPlayers;
  }

  /**
   * Retorna o tipo de lobby.
   * @returns {string}
   */
  getType() {
    return this.#type;
  }

  /**
   * Retorna o mínimo de jogadores.
   * @returns {number}
   */
  getMinPlayers() {
    return this.#minPlayers;
  }

  /**
   * Retorna o máximo de jogadores (null = sem limite).
   * @returns {number|null}
   */
  getMaxPlayers() {
    return this.#maxPlayers;
  }

  /**
   * Verifica se é lobby multi (sem limite de jogadores).
   * @returns {boolean}
   */
  isMulti() {
    return this.#type === 'multi';
  }

  /**
   * Valida se quantidade de jogadores é válida para este tipo.
   * @param {number} count
   * @returns {boolean}
   */
  isValidPlayerCount(count) {
    if (count < this.#minPlayers) return false;
    if (this.#maxPlayers !== null && count > this.#maxPlayers) return false;
    return true;
  }
}
