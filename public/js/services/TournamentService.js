/**
 * @layer services
 * @group tournament
 * @role Service
 * @depends TournamentRepository, Tournament
 * @exports TournamentService
 *
 * Service: Orquestra a lógica de campeonatos/torneios.
 * Coordena TournamentRepository e lógica de ranking.
 * Não contém lógica visual — apenas métodos de domínio.
 * Estrutura base — sem implementação ainda.
 */

import { TournamentRepository } from '../repositories/TournamentRepository.js';

export class TournamentService {
  /** @type {TournamentService|null} */
  static #instance = null;

  /** @type {import('../repositories/TournamentRepository.js').TournamentRepository} */
  #tournamentRepository;

  // -------------------------------------------------------
  // Singleton
  // -------------------------------------------------------

  /**
   * Retorna instância única.
   * @static
   * @returns {TournamentService}
   */
  static getInstance() {
    if (!TournamentService.#instance) {
      TournamentService.#instance = new TournamentService(TournamentRepository.getInstance());
    }
    return TournamentService.#instance;
  }

  /**
   * @param {import('../repositories/TournamentRepository.js').TournamentRepository} tournamentRepository
   */
  constructor(tournamentRepository) {
    this.#tournamentRepository = tournamentRepository;
  }

  // -------------------------------------------------------
  // Gerenciamento de torneios
  // -------------------------------------------------------

  /**
   * Cria um novo torneio.
   * @param {Tournament} tournament
   * @returns {Promise<void>}
   */
  async createTournament(tournament) {
    // TODO: Validar Tournament
    // TODO: Chamar tournamentRepository.createTournament()
  }

  /**
   * Obtém um torneio pelo ID.
   * @param {string} tournamentId
   * @returns {Promise<Tournament|null>}
   */
  async getTournament(tournamentId) {
    // TODO: Chamar tournamentRepository.getTournamentById()
    return null;
  }

  /**
   * Obtém todos os torneios.
   * @returns {Promise<Tournament[]>}
   */
  async getAllTournaments() {
    // TODO: Chamar tournamentRepository.getAllTournaments()
    return [];
  }

  /**
   * Ativa um torneio.
   * @param {string} tournamentId
   * @returns {Promise<void>}
   */
  async activateTournament(tournamentId) {
    // TODO: Obter torneio
    // TODO: Validar estado (deve estar em draft)
    // TODO: Chamr tournamentRepository.updateTournament() com status 'active'
  }

  /**
   * Finaliza um torneio.
   * @param {string} tournamentId
   * @returns {Promise<void>}
   */
  async finishTournament(tournamentId) {
    // TODO: Obter torneio
    // TODO: Chamar tournamentRepository.updateTournament() com status 'finished'
  }

  /**
   * Deleta um torneio.
   * @param {string} tournamentId
   * @returns {Promise<void>}
   */
  async deleteTournament(tournamentId) {
    // TODO: Obter torneio
    // TODO: Validar se pode deletar (deve estar em draft)
    // TODO: Chamar tournamentRepository.deleteTournament()
  }

  // -------------------------------------------------------
  // Pontuação e ranking
  // -------------------------------------------------------

  /**
   * Registra pontos de um jogador em um torneio.
   * @param {string} tournamentId
   * @param {string} uid
   * @param {Object} scoreData - {points, wins, losses, ...}
   * @returns {Promise<void>}
   */
  async recordPlayerScore(tournamentId, uid, scoreData) {
    // TODO: Validar tournamentId e uid
    // TODO: Validar scoreData
    // TODO: Chamar tournamentRepository.recordScore()
  }

  /**
   * Obtém score de um jogador em um torneio.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<Object|null>}
   */
  async getPlayerScore(tournamentId, uid) {
    // TODO: Chamar tournamentRepository.getPlayerScore()
    return null;
  }

  /**
   * Obtém ranking top N de um torneio.
   * @param {string} tournamentId
   * @param {number} [limit=50]
   * @returns {Promise<Array<{uid: string, score: Object}>>}
   */
  async getLeaderboardTop(tournamentId, limit = 50) {
    // TODO: Chamar tournamentRepository.getLeaderboardTop()
    return [];
  }

  /**
   * Obtém posição de um jogador no ranking.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<number|null>}
   */
  async getPlayerRank(tournamentId, uid) {
    // TODO: Chamar tournamentRepository.getPlayerRank()
    return null;
  }

  /**
   * Remove um jogador do torneio.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async removePlayer(tournamentId, uid) {
    // TODO: Chamar tournamentRepository.removePlayerFromLeaderboard()
  }

  // -------------------------------------------------------
  // Inscrição (enrollment)
  // -------------------------------------------------------

  /**
   * Inscreve um jogador em um torneio.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async enrollPlayer(tournamentId, uid) {
    // TODO: Validar torneio está ativo
    // TODO: Validar jogador não está inscrito
    // TODO: Registrar inscricacao no leaderboard (score inicial = 0)
  }

  /**
   * Verifica se um jogador está inscrito.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<boolean>}
   */
  async isPlayerEnrolled(tournamentId, uid) {
    // TODO: Obter score do jogador
    // TODO: Retorna true se existe
    return false;
  }

  /**
   * Desinscreve um jogador do torneio.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async unenrollPlayer(tournamentId, uid) {
    // TODO: Chamar removePlayer()
  }
}
