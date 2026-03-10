/**
 * @layer repositories
 * @group tournament
 * @role Repository
 * @depends FirebaseService, Tournament
 * @exports TournamentRepository
 *
 * Repository: Acesso aos dados de torneios no Firebase RTDB.
 * Responsável APENAS por operações de CRUD com o banco de dados.
 * Não contém lógica de negócio — somente chamadas ao RTDB.
 * Estrutura: /tournaments/list/{tournamentId}, leaderboard/{tournamentId}/{uid}
 */

import { Tournament } from '../domain/Tournament.js';
import { FirebaseService } from '../services/FirebaseService.js';

export class TournamentRepository {
  /** @type {TournamentRepository|null} */
  static #instance = null;

  /** @type {import('../services/FirebaseService.js').FirebaseService} */
  #firebaseService;

  // -------------------------------------------------------
  // Singleton
  // -------------------------------------------------------

  /**
   * Retorna instância única.
   * @static
   * @returns {TournamentRepository}
   */
  static getInstance() {
    if (!TournamentRepository.#instance) {
      TournamentRepository.#instance = new TournamentRepository(FirebaseService.getInstance());
    }
    return TournamentRepository.#instance;
  }

  /**
   * @param {import('../services/FirebaseService.js').FirebaseService} firebaseService
   */
  constructor(firebaseService) {
    this.#firebaseService = firebaseService;
  }

  // -------------------------------------------------------
  // Lista de torneios
  // -------------------------------------------------------

  /**
   * Cria um novo torneio.
   * Path: /tournaments/list/{tournamentId}
   * @param {Tournament} tournament
   * @returns {Promise<void>}
   */
  async createTournament(tournament) {
    // TODO: Implementar escrita de Tournament em /tournaments/list/{tournamentId}
  }

  /**
   * Obtém um torneio pelo ID.
   * @param {string} tournamentId
   * @returns {Promise<Tournament|null>}
   */
  async getTournamentById(tournamentId) {
    // TODO: Implementar leitura de /tournaments/list/{tournamentId}
    // TODO: Converter para instância Tournament
    return null;
  }

  /**
   * Obtém todos os torneios.
   * @returns {Promise<Tournament[]>}
   */
  async getAllTournaments() {
    // TODO: Implementar leitura de /tournaments/list
    // TODO: Converter cada um para instância Tournament
    return [];
  }

  /**
   * Atualiza um torneio.
   * @param {string} tournamentId
   * @param {Object} updates
   * @returns {Promise<void>}
   */
  async updateTournament(tournamentId, updates) {
    // TODO: Implementar atualização de /tournaments/list/{tournamentId}
  }

  /**
   * Deleta um torneio.
   * @param {string} tournamentId
   * @returns {Promise<void>}
   */
  async deleteTournament(tournamentId) {
    // TODO: Implementar remoção de /tournaments/list/{tournamentId}
  }

  // -------------------------------------------------------
  // Leaderboard (ranking)
  // -------------------------------------------------------

  /**
   * Registra pontos de um jogador em um torneio.
   * Path: /tournaments/leaderboard/{tournamentId}/{uid}
   * @param {string} tournamentId
   * @param {string} uid
   * @param {Object} scoreData - {points, wins, losses, ...}
   * @returns {Promise<void>}
   */
  async recordScore(tournamentId, uid, scoreData) {
    // TODO: Implementar escrita em /tournaments/leaderboard/{tournamentId}/{uid}
  }

  /**
   * Obtém o score de um jogador em um torneio.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<Object|null>}
   */
  async getPlayerScore(tournamentId, uid) {
    // TODO: Implementar leitura de /tournaments/leaderboard/{tournamentId}/{uid}
    return null;
  }

  /**
   * Obtém todo o leaderboard de um torneio.
   * @param {string} tournamentId
   * @returns {Promise<Object>}
   */
  async getLeaderboard(tournamentId) {
    // TODO: Implementar leitura de /tournaments/leaderboard/{tournamentId}
    return {};
  }

  /**
   * Obtém o top N de um leaderboard.
   * @param {string} tournamentId
   * @param {number} [limit=50]
   * @returns {Promise<Array<{uid: string, score: Object}>>}
   */
  async getLeaderboardTop(tournamentId, limit = 50) {
    // TODO: Implementar leitura ordenada de /tournaments/leaderboard/{tournamentId}
    // TODO: Limitar a N resultados
    return [];
  }

  /**
   * Obtém a posição de um jogador no leaderboard.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<number|null>}
   */
  async getPlayerRank(tournamentId, uid) {
    // TODO: Implementar obtenção de rank/posição
    return null;
  }

  /**
   * Remove um jogador do leaderboard.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async removePlayerFromLeaderboard(tournamentId, uid) {
    // TODO: Implementar remoção de /tournaments/leaderboard/{tournamentId}/{uid}
  }

  /**
   * Limpa todo o leaderboard de um torneio.
   * @param {string} tournamentId
   * @returns {Promise<void>}
   */
  async clearLeaderboard(tournamentId) {
    // TODO: Implementar limpeza de /tournaments/leaderboard/{tournamentId}
  }
}
