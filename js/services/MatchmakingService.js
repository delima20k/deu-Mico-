/**
 * @layer services
 * @group matchmaking
 * @role Service
 * @depends LobbyRepository, MatchRepository, LobbyType, Match, FirebaseService
 * @exports MatchmakingService
 *
 * Service: Orquestra matchmaking completo (FASE 2)
 * enterQueue, leaveQueue, tryBecomeCoordinator, tryStartMatch
 * Lógica de lobby_multi 6s + startToken anti-corrida
 */

import { LobbyType } from '../domain/LobbyType.js';
import { Match } from '../domain/Match.js';
import { LobbyRepository } from '../repositories/LobbyRepository.js';
import { MatchRepository } from '../repositories/MatchRepository.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { FirebaseService } from '../services/FirebaseService.js';

export class MatchmakingService {
  /** @type {MatchmakingService|null} */
  static #instance = null;

  /** @type {import('../repositories/LobbyRepository.js').LobbyRepository} */
  #lobbyRepository;

  /** @type {import('../repositories/MatchRepository.js').MatchRepository} */
  #matchRepository;

  /** @type {import('../repositories/UserRepository.js').UserRepository} */
  #userRepository;

  /** @type {import('../services/FirebaseService.js').FirebaseService} */
  #firebaseService;

  /** @type {ReturnType<typeof setTimeout>|null} Timer local para deadline do lobby multi/tournament */
  #multiDeadlineTimer = null;

  /** @type {string} lobbyType do timer ativo ('multi' ou 'tournament') */
  #multiDeadlineLobbyType = 'tournament';

  static getInstance() {
    if (!MatchmakingService.#instance) {
      MatchmakingService.#instance = new MatchmakingService(
        LobbyRepository.getInstance(),
        MatchRepository.getInstance(),
        UserRepository.getInstance(),
        FirebaseService.getInstance()
      );
    }
    return MatchmakingService.#instance;
  }

  constructor(lobbyRepository, matchRepository, userRepository, firebaseService) {
    this.#lobbyRepository = lobbyRepository;
    this.#matchRepository = matchRepository;
    this.#userRepository = userRepository;
    this.#firebaseService = firebaseService;
  }

  // =========== FASE 2: Main Methods ===========

  /**
   * User enters a queue
   * @param {string} lobbyType - '2p','3p','4p','5p','6p','multi'
   * @param {string} uid
   * @param {Object} userData - {name, avatarUrl, ...}
   * @returns {Promise<void>}
   */
  async enterQueue(lobbyType, uid, userData) {
    if (!uid) throw new Error('[MatchmakingService] uid obrigatório');
    if (!lobbyType) throw new Error('[MatchmakingService] lobbyType obrigatório');

    await this.#lobbyRepository.joinQueue(lobbyType, uid, userData);

    if (lobbyType === 'multi' || lobbyType === 'tournament') {
      await this.#resetMultiDeadline(lobbyType);
    } else {
      await this.#tryCreateMatchIfReady(lobbyType);
    }
  }

  /**
   * User leaves queue
   * @param {string} lobbyType
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async leaveQueue(lobbyType, uid) {
    if (!uid) throw new Error('[MatchmakingService] uid obrigatório');
    if (!lobbyType) throw new Error('[MatchmakingService] lobbyType obrigatório');
    await this.#lobbyRepository.leaveQueue(lobbyType, uid);
  }

  /**
   * Try to become coordinator with lock
   * @param {string} lobbyType
   * @param {string} uid
   * @returns {Promise<boolean>}
   */
  async tryBecomeCoordinator(lobbyType, uid) {
    if (!uid || !lobbyType) throw new Error('[MM] uid/lobbyType obrigatório');

    const lock = await this.#lobbyRepository.getLock(lobbyType);
    if (lock) return false;

    try {
      await this.#lobbyRepository.setLock(lobbyType, {
        coordinatorId: uid,
        startToken: this.#genToken(),
        lockedAt: Date.now(),
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Release coordinator lock
   * @param {string} lobbyType
   * @returns {Promise<void>}
   */
  async releaseLock(lobbyType) {
    if (!lobbyType) throw new Error('[MM] lobbyType obrigatório');
    await this.#lobbyRepository.removeLock(lobbyType);
  }

  /**
   * Try to start match
   * For multi: if >=6 OR deadline expired with 2+
   * For fixed: only if full
   * @param {string} uid - coordinator id
   * @param {string} [lobbyType='multi'] - specify if not multi
   * @returns {Promise<boolean>}
   */
  async tryStartMatch(uid, lobbyType = 'multi') {
    if (!uid || !lobbyType) throw new Error('[MM] uid/lobbyType obrigatório');

    const lock = await this.#lobbyRepository.getLock(lobbyType);
    if (!lock || lock.coordinatorId !== uid) return false;

    try {
      // Usa startToken atômico para evitar corrida ao iniciar
      const acquired = await this.#lobbyRepository.acquireStartToken(lobbyType, uid);
      if (!acquired) return false;

      const queueUsers = await this.#lobbyRepository.getQueueUsers(lobbyType);
      // Limita a 6 jogadores (máximo do jogo)
      const playerIds = Object.keys(queueUsers).slice(0, 6);

      if (playerIds.length < 2) return false;

      await this.#createAndAssignMatch(lobbyType, playerIds, uid);
      return true;
    } finally {
      await this.#lobbyRepository.clearStartToken(lobbyType, uid);
      await this.releaseLock(lobbyType);
    }
  }

  /**
   * Get queue users
   * @param {string} lobbyType
   * @returns {Promise<Object>}
   */
  async getQueueUsers(lobbyType) {
    return this.#lobbyRepository.getQueueUsers(lobbyType);
  }

  /**
   * Cria match quando a sala fica pronta (chamado pelo GameRoomMonitor).
   * @param {string} lobbyType - Tipo de lobby (2p, 3p, ..., 6p, multi)
   * @param {string[]} playerIds - IDs dos jogadores na sala
   * @returns {Promise<string>} matchId criado
   */
  async createMatchWhenReady(lobbyType, playerIds) {
    if (!lobbyType || !playerIds || playerIds.length < 2) {
      throw new Error('[Matchmaking] lobbyType e playerIds (min 2) são obrigatórios');
    }
    return this.#createAndAssignMatch(lobbyType, playerIds);
  }

  /**
   * Get match
   * @param {string} matchId
   * @returns {Promise<Match|null>}
   */
  async getMatch(matchId) {
    return this.#matchRepository.getMatchById(matchId);
  }

  /**
   * Register presence
   * @param {string} matchId
   * @param {string} uid
   * @param {Object} data
   * @returns {Promise<void>}
   */
  async registerPresence(matchId, uid, data = {}) {
    return this.#matchRepository.registerPresence(matchId, uid, data);
  }

  /**
   * Remove presence
   * @param {string} matchId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async removePresence(matchId, uid) {
    return this.#matchRepository.removePresence(matchId, uid);
  }

  /**
   * Get match presence
   * @param {string} matchId
   * @returns {Promise<Object>}
   */
  async getMatchPresence(matchId) {
    return this.#matchRepository.getPresence(matchId);
  }

  /**
   * Send chat message
   * @param {string} matchId
   * @param {string} uid
   * @param {string} text
   * @returns {Promise<void>}
   */
  async sendChatMessage(matchId, uid, text, name = 'Jogador') {
    if (!matchId || !uid || !text) throw new Error('[MM] param inválido');
    return this.#matchRepository.pushChatMessage(matchId, {
      uid,
      name,
      text: text.trim(),
      ts: Date.now(),
    });
  }

  /**
   * Get chat messages
   * @param {string} matchId
   * @returns {Promise<Object>}
   */
  async getChatMessages(matchId) {
    return this.#matchRepository.getChatMessages(matchId);
  }

  /**
   * Start match
   * @param {string} matchId
   * @returns {Promise<void>}
   */
  async startMatch(matchId) {
    const match = await this.#matchRepository.getMatchById(matchId);
    if (!match) throw new Error('[MM] Match não encontrado');
    match.markStarted();
    await this.#matchRepository.setMatchState(matchId, 'started');
  }

  /**
   * Finish match
   * @param {string} matchId
   * @returns {Promise<void>}
   */
  async finishMatch(matchId) {
    const match = await this.#matchRepository.getMatchById(matchId);
    if (!match) throw new Error('[MM] Match não encontrado');
    match.markFinished();
    await this.#matchRepository.setMatchState(matchId, 'finished');
  }

  /**
   * Cancel match
   * @param {string} matchId
   * @returns {Promise<void>}
   */
  async cancelMatch(matchId) {
    const match = await this.#matchRepository.getMatchById(matchId);
    if (!match) throw new Error('[MM] Match não encontrado');
    const presence = await this.#matchRepository.getPresence(matchId);
    for (const uid of Object.keys(presence)) {
      await this.#matchRepository.removePresence(matchId, uid);
    }
    await this.#matchRepository.deleteMatch(matchId);
  }

  /**
   * Check if multi deadline expired
   * @returns {Promise<boolean>}
   */
  async isMultiDeadlineExpired() {
    const deadline = await this.#lobbyRepository.getMultiDeadline();
    return deadline ? Date.now() >= deadline : false;
  }

  /**
   * Get multi deadline
   * @returns {Promise<number|null>}
   */
  async getMultiDeadline() {
    return this.#lobbyRepository.getMultiDeadline();
  }

  // =========== PRIVATE HELPERS ===========

  /**
   * Try create match for fixed lobbies
   * @private
   */
  async #tryCreateMatchIfReady(lobbyType) {
    const lobbyTypeObj = new LobbyType(lobbyType);
    const expected = lobbyTypeObj.getMaxPlayers();

    const queueUsers = await this.#lobbyRepository.getQueueUsers(lobbyType);
    const playerIds = Object.keys(queueUsers);

    if (playerIds.length < expected) return false;

    // Usa startToken atômico (runTransaction) em vez do par getLock/setLock não-atômico
    const coordId = `coord_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const acquired = await this.#lobbyRepository.acquireStartToken(lobbyType, coordId);
    if (!acquired) {
      return false;
    }

    try {
      // Re-verifica fila após adquirir token (evita criar match vazio)
      const recheck = await this.#lobbyRepository.getQueueUsers(lobbyType);
      const recheckIds = Object.keys(recheck);
      if (recheckIds.length < expected) {
        return false;
      }

      // Verifica se algum jogador já tem assign recente (evita duplicar)
      const slicedIds = recheckIds.slice(0, expected);
      for (const uid of slicedIds) {
        const existing = await this.#lobbyRepository.getAssignment(lobbyType, uid);
        if (existing?.createdAt && (Date.now() - existing.createdAt) < 60_000) {
          return false;
        }
      }

      await this.#createAndAssignMatch(lobbyType, slicedIds, coordId);
      return true;
    } finally {
      await this.#lobbyRepository.clearStartToken(lobbyType, coordId);
    }
  }

  /**
   * Create and assign match
   * @param {string} lobbyType
   * @param {string[]} playerIds
   * @param {string} [coordId] - ID do coordenador (para log)
   * @private
   */
  async #createAndAssignMatch(lobbyType, playerIds, coordId = 'unknown') {
    const lobbyTypeObj = new LobbyType(lobbyType);
    const matchId = this.#genMatchId();
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    try {
      // 1. Busca dados completos de cada jogador
      const playersData = {};
      
      for (const uid of playerIds) {
        try {
          const profile = await this.#userRepository.getProfile(uid);
          playersData[uid] = {
            name: profile?.name || `Jogador ${uid.slice(0, 8)}`,
            avatarUrl: profile?.avatarUrl || null,
            joinedAt: Date.now(),
          };
        } catch (error) {
          console.error(`[Matchmaking] Erro ao carregar perfil de ${uid.slice(0, 8)}:`, error);
          playersData[uid] = {
            name: `Jogador ${uid.slice(0, 8)}`,
            avatarUrl: null,
            joinedAt: Date.now(),
          };
        }
      }

      // 2. Cria Match object e salva metadados + players em write único
      // para respeitar as regras de segurança do RTDB.
      const match = new Match({
        matchId,
        lobbyType: lobbyTypeObj,
        playerIds,
      });

      await this.#matchRepository.createMatch(match, playersData);

      // 3. Atribui cada jogador à partida e remove da fila
      const now = Date.now();
      for (const uid of playerIds) {
        try {
          await this.#lobbyRepository.assignMatch(lobbyType, uid, {
            matchId,
            lobbyType,
            batchId,
            playerCount: playerIds.length,
            createdAt: now,
            ts: now,
          });
          await this.#lobbyRepository.leaveQueue(lobbyType, uid);
        } catch (error) {
          console.error(`[Matchmaking] Erro ao atribuir ${uid.slice(0, 8)}:`, error);
        }
      }

      return matchId;

    } catch (error) {
      console.error('[Matchmaking] Erro na criação do match:', error);
      // Tenta marcar match como abandoned para não ficar sobrando
      try {
        await this.#matchRepository.updateMatchStatus(matchId, 'abandoned');
      } catch (_) { /* ignora */ }
      throw error;
    }
  }

  /**
   * Gerencia a fila multi/tournament com temporização dinâmica:
   *  - 2 jogadores  → aguarda 15 s antes de iniciar
   *  - 3-5 jogadores → redefine para +5 s (rolling)
   *  - 6 jogadores  → inicia imediatamente
   * @param {string} [lobbyType='tournament']
   * @private
   */
  async #resetMultiDeadline(lobbyType = 'tournament') {
    const queueUsers = await this.#lobbyRepository.getQueueUsers(lobbyType);
    const count = Object.keys(queueUsers).length;

    // Cancela timer anterior (novo join redefine a contagem)
    if (this.#multiDeadlineTimer) {
      clearTimeout(this.#multiDeadlineTimer);
      this.#multiDeadlineTimer = null;
    }
    this.#multiDeadlineLobbyType = lobbyType;

    if (count < 2) {
      return;
    }

    let waitMs;
    if (count >= 6) {
      waitMs = 0;       // 6 jogadores → inicia imediatamente
    } else if (count === 2) {
      waitMs = 15_000;  // 1º par → espera 15 s
    } else {
      waitMs = 5_000;   // 3-5 jogadores → rolling 5 s
    }

    const deadlineTs = Date.now() + waitMs;
    // Armazena deadline no Firebase para sincronização entre clientes
    this.#lobbyRepository.setMultiDeadline(deadlineTs).catch(() => {});
    this.#lobbyRepository.setMultiLastJoinTs(Date.now()).catch(() => {});

    if (waitMs === 0) {
      await this.#tryStartMultiMatch(lobbyType);
    } else {
      this.#multiDeadlineTimer = setTimeout(async () => {
        this.#multiDeadlineTimer = null;
        await this.#tryStartMultiMatch(lobbyType);
      }, waitMs);
    }
  }

  /**
   * Tenta assumir a coordenação e iniciar o match multi/tournament.
   * @param {string} lobbyType
   * @private
   */
  async #tryStartMultiMatch(lobbyType) {
    const coordId = `coord_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    try {
      const isCoord = await this.tryBecomeCoordinator(lobbyType, coordId);
      if (isCoord) {
        await this.tryStartMatch(coordId, lobbyType);
      }
    } catch (err) {
      console.error('[MultiLobby] erro ao iniciar match:', err);
    }
  }

  /**
   * Generate match ID
   * @private
   */
  #genMatchId() {
    return `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate token
   * @private
   */
  #genToken() {
    return Math.random().toString(36).substr(2, 16);
  }
}
