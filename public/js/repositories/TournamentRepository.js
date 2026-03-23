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

  /**
   * @returns {{db: any, dbMod: any}}
   * @private
   */
  #getDbContext() {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db || !dbMod) {
      throw new Error('[Tournament] Database nao inicializado');
    }
    return { db, dbMod };
  }

  /**
   * @param {Tournament|Object} tournament
   * @returns {Object}
   * @private
   */
  #toTournamentPayload(tournament) {
    if (tournament instanceof Tournament) {
      return {
        tournamentId: tournament.getTournamentId(),
        name: tournament.getName(),
        startDate: tournament.getStartDate(),
        endDate: tournament.getEndDate(),
        status: tournament.getStatus(),
        rules: tournament.getRules(),
      };
    }

    return {
      ...(tournament || {}),
      tournamentId: tournament?.tournamentId || tournament?.id,
    };
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
    const { db, dbMod } = this.#getDbContext();
    const now = Date.now();
    const payload = this.#toTournamentPayload(tournament);
    const tournamentId = payload.tournamentId;

    if (!tournamentId) {
      throw new Error('[Tournament] createTournament sem tournamentId');
    }

    const ref = dbMod.ref(db, `tournaments/list/${tournamentId}`);
    await dbMod.set(ref, {
      ...payload,
      id: tournamentId,
      maxParticipants: payload.maxParticipants ?? 8,
      enrolledCount: payload.enrolledCount ?? 0,
      enrolledUsers: payload.enrolledUsers || {},
      countdownStartAt: payload.countdownStartAt ?? null,
      countdownEndsAt: payload.countdownEndsAt ?? null,
      startedAt: payload.startedAt ?? null,
      createdAt: payload.createdAt ?? now,
      updatedAt: now,
      status: payload.status || 'waiting',
    });

    await dbMod.set(dbMod.ref(db, 'tournaments/currentTournamentId'), tournamentId);
    console.log(`[Tournament] create tournamentId=${tournamentId}`);
  }

  /**
   * Obtém um torneio pelo ID.
   * @param {string} tournamentId
   * @returns {Promise<Tournament|null>}
   */
  async getTournamentById(tournamentId) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/list/${tournamentId}`);
    const snap = await dbMod.get(ref);
    if (!snap.exists()) return null;
    return { id: tournamentId, tournamentId, ...snap.val() };
  }

  /**
   * Obtém todos os torneios.
   * @returns {Promise<Tournament[]>}
   */
  async getAllTournaments() {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, 'tournaments/list');
    const snap = await dbMod.get(ref);
    if (!snap.exists()) return [];

    return Object.entries(snap.val() || {}).map(([id, value]) => ({
      id,
      tournamentId: id,
      ...value,
    }));
  }

  /**
   * Atualiza um torneio.
   * @param {string} tournamentId
   * @param {Object} updates
   * @returns {Promise<void>}
   */
  async updateTournament(tournamentId, updates) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/list/${tournamentId}`);
    await dbMod.update(ref, {
      ...(updates || {}),
      updatedAt: Date.now(),
    });
  }

  /**
   * Deleta um torneio.
   * @param {string} tournamentId
   * @returns {Promise<void>}
   */
  async deleteTournament(tournamentId) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/list/${tournamentId}`);
    await dbMod.remove(ref);
  }

  /**
   * Garante que o torneio exista e define-o como atual.
   * @param {string} tournamentId
   * @param {Object} defaults
   * @returns {Promise<Object>}
   */
  async ensureTournament(tournamentId, defaults = {}) {
    const { db, dbMod } = this.#getDbContext();
    const now = Date.now();
    const ref = dbMod.ref(db, `tournaments/list/${tournamentId}`);

    const result = await dbMod.runTransaction(ref, (current) => {
      if (current) {
        return {
          ...current,
          updatedAt: now,
        };
      }

      return {
        id: tournamentId,
        tournamentId,
        name: defaults.name || 'Campeonato Deu Mico',
        prize: defaults.prize || 'Premiacao especial do campeonato',
        startDate: defaults.startDate || new Date(now).toISOString(),
        status: defaults.status || 'waiting',
        maxParticipants: defaults.maxParticipants ?? 8,
        enrolledCount: 0,
        enrolledUsers: {},
        countdownStartAt: null,
        countdownEndsAt: null,
        startedAt: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    const tournament = result.snapshot.val() || null;
    await dbMod.set(dbMod.ref(db, 'tournaments/currentTournamentId'), tournamentId);
    return tournament;
  }

  /**
   * Retorna ID do torneio atual salvo em /tournaments/currentTournamentId.
   * @returns {Promise<string|null>}
   */
  async getCurrentTournamentId() {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, 'tournaments/currentTournamentId');
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : null;
  }

  /**
   * Listener realtime do torneio.
   * @param {string} tournamentId
   * @param {(data: Object|null) => void} callback
   * @returns {Function}
   */
  subscribeTournament(tournamentId, callback) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/list/${tournamentId}`);

    const unsubscribe = dbMod.onValue(ref, (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }

      callback({
        id: tournamentId,
        tournamentId,
        ...snap.val(),
      });
    }, (error) => {
      console.error(`[Tournament] subscribeTournament error tournamentId=${tournamentId}`, error);
    });

    return () => unsubscribe();
  }

  /**
   * Entrada atomica no torneio, com inicio idempotente de countdown.
   * @param {string} tournamentId
   * @param {{uid: string, name?: string, avatarUrl?: string}} userData
   * @param {{countdownDurationMs?: number}} [options]
   * @returns {Promise<{joined: boolean, alreadyJoined: boolean, tournament: Object|null}>}
   */
  async joinTournament(tournamentId, userData, options = {}) {
    const { db, dbMod } = this.#getDbContext();
    const uid = userData?.uid;
    if (!uid) {
      throw new Error('[Tournament] joinTournament sem uid');
    }

    const countdownDurationMs = options.countdownDurationMs ?? 60_000;
    const userRef = dbMod.ref(db, `tournaments/list/${tournamentId}/enrolledUsers/${uid}`);
    const wasJoinedSnap = await dbMod.get(userRef);
    const alreadyJoined = wasJoinedSnap.exists();

    const tournamentRef = dbMod.ref(db, `tournaments/list/${tournamentId}`);
    const result = await dbMod.runTransaction(tournamentRef, (current) => {
      const now = Date.now();
      const base = current || {
        id: tournamentId,
        tournamentId,
        name: 'Campeonato Deu Mico',
        prize: 'Premiacao especial do campeonato',
        startDate: new Date(now).toISOString(),
        status: 'waiting',
        maxParticipants: 8,
        enrolledCount: 0,
        enrolledUsers: {},
        countdownStartAt: null,
        countdownEndsAt: null,
        startedAt: null,
        createdAt: now,
      };

      const enrolledUsers = { ...(base.enrolledUsers || {}) };
      const maxParticipants = base.maxParticipants ?? 8;
      let enrolledCount = Number(base.enrolledCount || 0);

      if (!enrolledUsers[uid]) {
        enrolledUsers[uid] = {
          uid,
          name: userData?.name || 'Jogador',
          avatarUrl: userData?.avatarUrl || '',
          joinedAt: now,
        };
        enrolledCount += 1;
      }

      let status = base.status || 'waiting';
      let countdownStartAt = base.countdownStartAt || null;
      let countdownEndsAt = base.countdownEndsAt || null;
      let startedAt = base.startedAt || null;

      if (status === 'countdown' && countdownEndsAt && now >= countdownEndsAt) {
        status = 'active';
        startedAt = startedAt || now;
      }

      if (
        status !== 'active'
        && !countdownStartAt
        && enrolledCount >= maxParticipants
      ) {
        countdownStartAt = now;
        countdownEndsAt = now + countdownDurationMs;
        status = 'countdown';
        console.log(`[Tournament] countdown iniciado tournamentId=${tournamentId} endsAt=${countdownEndsAt}`);
      }

      return {
        ...base,
        enrolledUsers,
        enrolledCount,
        status,
        countdownStartAt,
        countdownEndsAt,
        startedAt,
        updatedAt: now,
      };
    });

    await dbMod.set(dbMod.ref(db, 'tournaments/currentTournamentId'), tournamentId);

    return {
      joined: !alreadyJoined,
      alreadyJoined,
      tournament: result.snapshot.exists() ? { id: tournamentId, tournamentId, ...result.snapshot.val() } : null,
    };
  }

  /**
   * Ativa torneio se countdown acabou (idempotente).
   * @param {string} tournamentId
   * @returns {Promise<boolean>} true se ficou ativo
   */
  async startTournamentIfCountdownElapsed(tournamentId) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/list/${tournamentId}`);

    const result = await dbMod.runTransaction(ref, (current) => {
      if (!current) return current;

      const now = Date.now();
      const status = current.status || 'waiting';
      const endAt = current.countdownEndsAt || 0;

      if (status === 'active') return current;
      if (status === 'countdown' && endAt > 0 && now >= endAt) {
        return {
          ...current,
          status: 'active',
          startedAt: current.startedAt || now,
          updatedAt: now,
        };
      }

      return current;
    });

    return result.snapshot.val()?.status === 'active';
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
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/leaderboard/${tournamentId}/${uid}`);
    await dbMod.update(ref, {
      ...(scoreData || {}),
      updatedAt: Date.now(),
    });
  }

  /**
   * Obtém o score de um jogador em um torneio.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<Object|null>}
   */
  async getPlayerScore(tournamentId, uid) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/leaderboard/${tournamentId}/${uid}`);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : null;
  }

  /**
   * Obtém todo o leaderboard de um torneio.
   * @param {string} tournamentId
   * @returns {Promise<Object>}
   */
  async getLeaderboard(tournamentId) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/leaderboard/${tournamentId}`);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : {};
  }

  /**
   * Obtém o top N de um leaderboard.
   * @param {string} tournamentId
   * @param {number} [limit=50]
   * @returns {Promise<Array<{uid: string, score: Object}>>}
   */
  async getLeaderboardTop(tournamentId, limit = 50) {
    const leaderboard = await this.getLeaderboard(tournamentId);
    return Object.entries(leaderboard)
      .map(([uid, score]) => ({ uid, score }))
      .sort((a, b) => {
        const pA = Number(a.score?.pointsMilli || 0);
        const pB = Number(b.score?.pointsMilli || 0);
        return pB - pA;
      })
      .slice(0, limit);
  }

  /**
   * Obtém a posição de um jogador no leaderboard.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<number|null>}
   */
  async getPlayerRank(tournamentId, uid) {
    const top = await this.getLeaderboardTop(tournamentId, 2000);
    const idx = top.findIndex((entry) => entry.uid === uid);
    return idx >= 0 ? idx + 1 : null;
  }

  /**
   * Remove um jogador do leaderboard.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async removePlayerFromLeaderboard(tournamentId, uid) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/leaderboard/${tournamentId}/${uid}`);
    await dbMod.remove(ref);
  }

  /**
   * Limpa todo o leaderboard de um torneio.
   * @param {string} tournamentId
   * @returns {Promise<void>}
   */
  async clearLeaderboard(tournamentId) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/leaderboard/${tournamentId}`);
    await dbMod.remove(ref);
  }

  /**
   * Listener realtime do leaderboard completo.
   * @param {string} tournamentId
   * @param {(data: Object) => void} callback
   * @returns {Function}
   */
  subscribeLeaderboard(tournamentId, callback) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/leaderboard/${tournamentId}`);

    const unsubscribe = dbMod.onValue(ref, (snap) => {
      callback(snap.exists() ? (snap.val() || {}) : {});
    }, (error) => {
      console.error(`[Ranking] subscribeLeaderboard error tournamentId=${tournamentId}`, error);
    });

    return () => unsubscribe();
  }

  /**
   * Soma pontos de forma idempotente via eventId.
   * @param {string} tournamentId
   * @param {{uid: string, name?: string, avatarUrl?: string, milliDelta: number, eventId: string, isDecisive?: boolean}} payload
   * @returns {Promise<Object|null>}
   */
  async addPairPoints(tournamentId, payload) {
    const { db, dbMod } = this.#getDbContext();
    const uid = payload?.uid;
    const eventId = payload?.eventId;
    const milliDelta = Number(payload?.milliDelta || 0);

    if (!uid || !eventId || !milliDelta) {
      throw new Error('[Ranking] addPairPoints requer uid, eventId e milliDelta');
    }

    const ref = dbMod.ref(db, `tournaments/leaderboard/${tournamentId}/${uid}`);
    const result = await dbMod.runTransaction(ref, (current) => {
      const now = Date.now();
      const base = current || {
        uid,
        name: payload?.name || 'Jogador',
        avatarUrl: payload?.avatarUrl || '',
        pointsMilli: 0,
        pairs: 0,
        decisivePairs: 0,
        processedEvents: {},
        createdAt: now,
      };

      const processedEvents = { ...(base.processedEvents || {}) };
      if (processedEvents[eventId]) {
        return base;
      }

      processedEvents[eventId] = now;

      const eventKeys = Object.keys(processedEvents);
      if (eventKeys.length > 120) {
        eventKeys
          .sort((a, b) => processedEvents[a] - processedEvents[b])
          .slice(0, eventKeys.length - 80)
          .forEach((key) => delete processedEvents[key]);
      }

      return {
        ...base,
        uid,
        name: payload?.name || base.name || 'Jogador',
        avatarUrl: payload?.avatarUrl ?? base.avatarUrl ?? '',
        pointsMilli: Number(base.pointsMilli || 0) + milliDelta,
        pairs: Number(base.pairs || 0) + 1,
        decisivePairs: Number(base.decisivePairs || 0) + (payload?.isDecisive ? 1 : 0),
        processedEvents,
        updatedAt: now,
        lastEventAt: now,
      };
    });

    return result.snapshot.exists() ? result.snapshot.val() : null;
  }
}
