/**
 * @layer domain
 * @group tournament
 * @role Entity
 * @depends none
 * @exports Tournament
 *
 * Entity: Representa um torneio/campeonato.
 * Encapsula estado, regras de pontuação e metadados.
 * Puro domínio — sem Firebase.
 */

export class Tournament {
  /** @type {string} */
  #tournamentId;

  /** @type {string} */
  #name;

  /** @type {number} */
  #startDate;

  /** @type {number} */
  #endDate;

  /** @type {string} */
  #status; // 'draft' | 'active' | 'finished'

  /** @type {Map<string, number>} */
  #leaderboard; // userId -> points

  /** @type {Object} */
  #rules;

  /**
   * @param {Object} config
   * @param {string} config.tournamentId - ID único
   * @param {string} config.name - Nome do torneio
   * @param {number} config.startDate - Data de início (timestamp)
   * @param {number} config.endDate - Data de fim (timestamp)
   * @param {Object} [config.rules] - Regras customizadas (opcional)
   */
  constructor({ tournamentId, name, startDate, endDate, rules = {} }) {
    this.#tournamentId = tournamentId;
    this.#name = name;
    this.#startDate = startDate;
    this.#endDate = endDate;
    this.#status = 'draft';
    this.#leaderboard = new Map();
    this.#rules = rules;
  }

  /**
   * Retorna o ID do torneio.
   * @returns {string}
   */
  getTournamentId() {
    return this.#tournamentId;
  }

  /**
   * Retorna o nome do torneio.
   * @returns {string}
   */
  getName() {
    return this.#name;
  }

  /**
   * Retorna o status do torneio.
   * @returns {string}
   */
  getStatus() {
    return this.#status;
  }

  /**
   * Define o status do torneio.
   * @param {string} status
   */
  setStatus(status) {
    this.#status = status;
  }

  /**
   * Ativa o torneio.
   */
  activate() {
    this.#status = 'active';
  }

  /**
   * Finaliza o torneio.
   */
  finish() {
    this.#status = 'finished';
  }

  /**
   * Retorna data de início.
   * @returns {number}
   */
  getStartDate() {
    return this.#startDate;
  }

  /**
   * Retorna data de fim.
   * @returns {number}
   */
  getEndDate() {
    return this.#endDate;
  }

  /**
   * Verifica se o torneio está ativo agora.
   * @returns {boolean}
   */
  isActive() {
    const now = Date.now();
    return this.#status === 'active' && now >= this.#startDate && now <= this.#endDate;
  }

  /**
   * Registra pontos de um jogador.
   * @param {string} userId
   * @param {number} points
   */
  addPoints(userId, points) {
    const current = this.#leaderboard.get(userId) || 0;
    this.#leaderboard.set(userId, current + points);
  }

  /**
   * Retorna pontos de um jogador.
   * @param {string} userId
   * @returns {number}
   */
  getPoints(userId) {
    return this.#leaderboard.get(userId) || 0;
  }

  /**
   * Retorna ranking top N.
   * @param {number} [limit=50]
   * @returns {Array<{userId: string, points: number}>}
   */
  getLeaderboardTop(limit = 50) {
    return Array.from(this.#leaderboard.entries())
      .map(([userId, points]) => ({ userId, points }))
      .sort((a, b) => b.points - a.points)
      .slice(0, limit);
  }

  /**
   * Retorna regras customizadas do torneio.
   * @returns {Object}
   */
  getRules() {
    return { ...this.#rules };
  }
}
