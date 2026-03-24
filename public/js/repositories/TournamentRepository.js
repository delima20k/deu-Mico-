/**
 * @layer repositories
 * @group tournament
 * @role Repository
 * @depends FirebaseService, Tournament
 * @exports TournamentRepository
 *
 * Repository: acesso ao RTDB para campeonato por instância/rodada.
 * Estrutura principal:
 * - /tournaments/list/{tournamentId}
 * - /tournaments/instances/{instanceId}
 * - /tournaments/currentJoinableInstanceId/{tournamentId}
 * - /tournaments/leaderboard/{tournamentId}/{uid}
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

  static MAX_PARTICIPANTS = 6;
  static MIN_POINTS_MILLI = 0;
  static MAX_POINTS_MILLI = 5900;

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
   * @param {number} value
   * @returns {number}
   * @private
   */
  #clampPointsMilli(value) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return TournamentRepository.MIN_POINTS_MILLI;
    return Math.max(
      TournamentRepository.MIN_POINTS_MILLI,
      Math.min(TournamentRepository.MAX_POINTS_MILLI, parsed)
    );
  }

  /**
   * @param {number} value
   * @returns {number}
   * @private
   */
  #normalizeMaxParticipants(value) {
    return Math.max(2, Math.min(TournamentRepository.MAX_PARTICIPANTS, Number(value || 6)));
  }

  /**
   * @param {string} tournamentId
   * @returns {string}
   * @private
   */
  #buildInstanceId(tournamentId) {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${tournamentId}_${Date.now()}_${rand}`;
  }

  /**
   * @param {string} instanceId
   * @param {number} matchNumber
   * @returns {string}
   * @private
   */
  #buildMatchId(instanceId, matchNumber) {
    return `tmatch_${instanceId}_${matchNumber}`;
  }

  /**
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {string}
   * @private
   */
  #buildEnrollmentIndexPath(tournamentId, uid) {
    return `tournaments/enrollmentIndex/${tournamentId}/${uid}`;
  }

  /**
   * @param {string} instanceId
   * @param {string} tournamentId
   * @param {Object} defaults
   * @returns {Object}
   * @private
   */
  #buildBaseInstance(instanceId, tournamentId, defaults = {}) {
    const now = Date.now();
    const maxParticipants = this.#normalizeMaxParticipants(
      defaults.maxParticipants ?? TournamentRepository.MAX_PARTICIPANTS
    );

    return {
      instanceId,
      tournamentId,
      status: defaults.status || 'waiting',
      maxParticipants,
      enrolledCount: Number(defaults.enrolledCount || 0),
      enrolledUsers: defaults.enrolledUsers || {},
      activePlayers: defaults.activePlayers || {},
      eliminatedPlayers: defaults.eliminatedPlayers || {},
      currentMatchId: defaults.currentMatchId || null,
      currentMatchNumber: Number(defaults.currentMatchNumber || 0),
      phase: defaults.phase || 'waiting',
      countdownStartAt: defaults.countdownStartAt || null,
      countdownEndsAt: defaults.countdownEndsAt || null,
      startedAt: defaults.startedAt || null,
      finishedAt: defaults.finishedAt || null,
      championUid: defaults.championUid || null,
      processedMatchResults: defaults.processedMatchResults || {},
      lastJoinEvent: defaults.lastJoinEvent || null,
      lastSystemNotice: defaults.lastSystemNotice || null,
      createdAt: Number(defaults.createdAt || now),
      updatedAt: now,
    };
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
      maxParticipants: payload.maxParticipants ?? 6,
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
        const normalizedMaxParticipants = this.#normalizeMaxParticipants(
          current.maxParticipants || defaults.maxParticipants || TournamentRepository.MAX_PARTICIPANTS
        );
        return {
          ...current,
          maxParticipants: normalizedMaxParticipants,
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
        maxParticipants: this.#normalizeMaxParticipants(defaults.maxParticipants),
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
   * Retorna todas as instâncias de um torneio.
   * @param {string} tournamentId
   * @returns {Promise<Array<Object>>}
   */
  async getInstancesByTournament(tournamentId) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, 'tournaments/instances');
    const snap = await dbMod.get(ref);
    if (!snap.exists()) return [];

    return Object.entries(snap.val() || {})
      .map(([id, value]) => ({ instanceId: id, ...value }))
      .filter((row) => row.tournamentId === tournamentId)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }

  /**
   * @param {string} instanceId
   * @returns {Promise<Object|null>}
   */
  async getInstanceById(instanceId) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/instances/${instanceId}`);
    const snap = await dbMod.get(ref);
    if (!snap.exists()) return null;
    return {
      instanceId,
      ...snap.val(),
    };
  }

  /**
   * Busca a inscrição de um usuário em instância ativa/countdown/waiting.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<{instance: Object|null}>}
   */
  async findUserEnrollment(tournamentId, uid) {
    if (!uid) return { instance: null };
    const instances = await this.getInstancesByTournament(tournamentId);
    const instance = instances.find((row) => {
      if (!row?.enrolledUsers?.[uid]) return false;
      const status = row.status || 'waiting';
      return status !== 'finished';
    }) || null;

    return { instance };
  }

  /**
   * Observa TODAS as instâncias de um torneio (filtro client-side).
   * @param {string} tournamentId
   * @param {(instances: Array<Object>) => void} callback
   * @returns {Function}
   */
  subscribeTournamentInstances(tournamentId, callback) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, 'tournaments/instances');

    const unsubscribe = dbMod.onValue(ref, (snap) => {
      if (!snap.exists()) {
        callback([]);
        return;
      }

      const rows = Object.entries(snap.val() || {})
        .map(([instanceId, value]) => ({ instanceId, ...value }))
        .filter((row) => row.tournamentId === tournamentId)
        .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

      callback(rows);
    }, (error) => {
      console.error(`[TournamentRound] subscribeTournamentInstances error tournamentId=${tournamentId}`, error);
    });

    return () => unsubscribe();
  }

  /**
   * Listener realtime de uma instância específica.
   * @param {string} instanceId
   * @param {(state: Object|null) => void} callback
   * @returns {Function}
   */
  subscribeTournamentInstance(instanceId, callback) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/instances/${instanceId}`);

    const unsubscribe = dbMod.onValue(ref, (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }

      callback({
        instanceId,
        ...snap.val(),
      });
    }, (error) => {
      console.error(`[TournamentRound] subscribeTournamentInstance error instanceId=${instanceId}`, error);
    });

    return () => unsubscribe();
  }

  /**
   * Retorna (ou cria) uma instância em espera para novas inscrições.
   * @param {string} tournamentId
   * @param {{maxParticipants?: number}} [options]
   * @returns {Promise<string>}
   */
  async ensureJoinableInstance(tournamentId, options = {}) {
    const { db, dbMod } = this.#getDbContext();
    const pointerRef = dbMod.ref(db, `tournaments/currentJoinableInstanceId/${tournamentId}`);
    const pointerSnap = await dbMod.get(pointerRef);
    const maxParticipants = this.#normalizeMaxParticipants(options.maxParticipants);

    if (pointerSnap.exists()) {
      const pointedId = pointerSnap.val();
      const pointed = await this.getInstanceById(pointedId);
      if (
        pointed
        && pointed.status === 'waiting'
        && Number(pointed.enrolledCount || 0) < Number(pointed.maxParticipants || maxParticipants)
      ) {
        return pointedId;
      }
    }

    const instanceId = this.#buildInstanceId(tournamentId);
    const baseInstance = this.#buildBaseInstance(instanceId, tournamentId, {
      status: 'waiting',
      maxParticipants,
      phase: 'waiting',
    });

    await dbMod.set(dbMod.ref(db, `tournaments/instances/${instanceId}`), baseInstance);
    await dbMod.set(pointerRef, instanceId);

    console.log(`[TournamentRound] created joinable instanceId=${instanceId} tournamentId=${tournamentId}`);
    return instanceId;
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
      throw new Error('[TournamentRound] joinTournament sem uid');
    }

    const countdownDurationMs = Number(options.countdownDurationMs || 60_000);
    const maxParticipants = this.#normalizeMaxParticipants(options.maxParticipants);

    await this.ensureTournament(tournamentId, {
      maxParticipants,
      status: 'waiting',
      name: 'Campeonato Deu Mico',
    });

    const indexEnrollment = await this.#resolveIndexedEnrollment(tournamentId, uid);
    if (indexEnrollment.instance) {
      return {
        joined: false,
        alreadyJoined: true,
        instanceId: indexEnrollment.instance.instanceId,
        instance: indexEnrollment.instance,
        tournament: await this.getTournamentById(tournamentId),
      };
    }

    const existingEnrollment = await this.findUserEnrollment(tournamentId, uid);
    if (existingEnrollment.instance) {
      await this.#setEnrollmentIndex(tournamentId, uid, existingEnrollment.instance.instanceId);
      return {
        joined: false,
        alreadyJoined: true,
        instanceId: existingEnrollment.instance.instanceId,
        instance: existingEnrollment.instance,
        tournament: await this.getTournamentById(tournamentId),
      };
    }

    const claimToken = `${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const claimResult = await this.#acquireEnrollmentClaim(tournamentId, uid, claimToken);

    if (claimResult.alreadyEnrolledInstanceId) {
      const indexedInstance = await this.getInstanceById(claimResult.alreadyEnrolledInstanceId);
      if (indexedInstance?.enrolledUsers?.[uid] && indexedInstance.status !== 'finished') {
        return {
          joined: false,
          alreadyJoined: true,
          instanceId: indexedInstance.instanceId,
          instance: indexedInstance,
          tournament: await this.getTournamentById(tournamentId),
        };
      }

      await this.#clearEnrollmentIndex(tournamentId, uid);
    }

    if (!claimResult.claimed) {
      const concurrentEnrollment = await this.findUserEnrollment(tournamentId, uid);
      if (concurrentEnrollment.instance) {
        await this.#setEnrollmentIndex(tournamentId, uid, concurrentEnrollment.instance.instanceId);
        return {
          joined: false,
          alreadyJoined: true,
          instanceId: concurrentEnrollment.instance.instanceId,
          instance: concurrentEnrollment.instance,
          tournament: await this.getTournamentById(tournamentId),
        };
      }

      throw new Error('[TournamentRound] Inscricao em andamento para este usuario');
    }

    try {
      let attempts = 0;
      while (attempts < 6) {
        attempts += 1;
        const joinableInstanceId = await this.ensureJoinableInstance(tournamentId, { maxParticipants });
        const instanceRef = dbMod.ref(db, `tournaments/instances/${joinableInstanceId}`);

        const txResult = await dbMod.runTransaction(instanceRef, (current) => {
          const now = Date.now();
          const base = current || this.#buildBaseInstance(joinableInstanceId, tournamentId, {
            maxParticipants,
            status: 'waiting',
            phase: 'waiting',
          });

          const status = base.status || 'waiting';
          const enrolledUsers = { ...(base.enrolledUsers || {}) };
          let enrolledCount = Number(base.enrolledCount || 0);
          const normalizedMax = this.#normalizeMaxParticipants(base.maxParticipants || maxParticipants);

          if (enrolledUsers[uid]) {
            return {
              ...base,
              maxParticipants: normalizedMax,
              updatedAt: now,
            };
          }

          if (status !== 'waiting' || enrolledCount >= normalizedMax) {
            return base;
          }

          enrolledUsers[uid] = {
            uid,
            name: userData?.name || 'Jogador',
            avatarUrl: userData?.avatarUrl || '',
            joinedAt: now,
          };
          enrolledCount += 1;

          let nextStatus = status;
          let countdownStartAt = base.countdownStartAt || null;
          let countdownEndsAt = base.countdownEndsAt || null;
          let lastSystemNotice = base.lastSystemNotice || null;

          if (enrolledCount >= normalizedMax && status === 'waiting') {
            countdownStartAt = countdownStartAt || now;
            countdownEndsAt = countdownEndsAt || (countdownStartAt + countdownDurationMs);
            nextStatus = 'countdown';
            lastSystemNotice = {
              type: 'countdown_started',
              ts: now,
              text: 'Combate comeca em 1 minuto',
              eventId: `countdown_${joinableInstanceId}_${countdownStartAt}`,
            };
            console.log(`[TournamentRound] countdown started instanceId=${joinableInstanceId} endsAt=${countdownEndsAt}`);
          }

          return {
            ...base,
            tournamentId,
            maxParticipants: normalizedMax,
            enrolledUsers,
            enrolledCount,
            status: nextStatus,
            phase: nextStatus === 'countdown' ? 'countdown' : (base.phase || 'waiting'),
            countdownStartAt,
            countdownEndsAt,
            lastJoinEvent: {
              uid,
              name: userData?.name || 'Jogador',
              ts: now,
              enrolledCount,
              eventId: `join_${uid}_${now}`,
            },
            lastSystemNotice,
            updatedAt: now,
          };
        });

        const instance = txResult.snapshot.exists()
          ? { instanceId: joinableInstanceId, ...txResult.snapshot.val() }
          : null;

        const joined = !!instance?.enrolledUsers?.[uid];
        const status = instance?.status || 'waiting';
        const isFull = Number(instance?.enrolledCount || 0) >= Number(instance?.maxParticipants || maxParticipants);

        if (joined) {
          await dbMod.set(dbMod.ref(db, 'tournaments/currentTournamentId'), tournamentId);
          await this.#setEnrollmentIndex(tournamentId, uid, joinableInstanceId);

          if (isFull || status !== 'waiting') {
            const pointerRef = dbMod.ref(db, `tournaments/currentJoinableInstanceId/${tournamentId}`);
            const pointerSnap = await dbMod.get(pointerRef);
            if (pointerSnap.exists() && pointerSnap.val() === joinableInstanceId) {
              await this.ensureJoinableInstance(tournamentId, { maxParticipants });
            }
          }

          return {
            joined: true,
            alreadyJoined: false,
            instanceId: joinableInstanceId,
            instance,
            tournament: await this.getTournamentById(tournamentId),
          };
        }

        if (!instance || status !== 'waiting' || isFull) {
          const pointerRef = dbMod.ref(db, `tournaments/currentJoinableInstanceId/${tournamentId}`);
          const pointerSnap = await dbMod.get(pointerRef);
          if (pointerSnap.exists() && pointerSnap.val() === joinableInstanceId) {
            await dbMod.remove(pointerRef);
          }
          continue;
        }
      }
    } finally {
      await this.#releaseEnrollmentClaim(tournamentId, uid, claimToken);
    }

    throw new Error('[TournamentRound] Falha ao entrar em instancia apos varias tentativas');
  }

  /**
   * Desiste da inscrição do torneio atual.
   * Remove o usuário da instância e atualiza enrolledCount em transação.
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<{left: boolean, instanceId: string|null, reason?: string}>}
   */
  async leaveTournament(tournamentId, uid) {
    if (!uid) {
      throw new Error('[TournamentRound] leaveTournament sem uid');
    }

    const { db, dbMod } = this.#getDbContext();
    const enrolled = await this.#resolveIndexedEnrollment(tournamentId, uid);
    const fallbackEnrollment = enrolled.instance
      ? enrolled
      : await this.findUserEnrollment(tournamentId, uid);

    const instance = fallbackEnrollment.instance;
    if (!instance?.instanceId) {
      await this.#clearEnrollmentIndex(tournamentId, uid);
      return { left: false, instanceId: null, reason: 'not_enrolled' };
    }

    const instanceRef = dbMod.ref(db, `tournaments/instances/${instance.instanceId}`);

    const result = await dbMod.runTransaction(instanceRef, (current) => {
      if (!current) return current;

      const now = Date.now();
      const status = current.status || 'waiting';
      const enrolledUsers = { ...(current.enrolledUsers || {}) };
      const activePlayers = { ...(current.activePlayers || {}) };
      let enrolledCount = Number(current.enrolledCount || 0);

      if (!enrolledUsers[uid]) {
        return current;
      }

      // Regra de desistência: permitida somente antes de iniciar a partida ativa.
      if (status === 'active') {
        return {
          ...current,
          updatedAt: now,
        };
      }

      delete enrolledUsers[uid];
      if (activePlayers[uid]) {
        delete activePlayers[uid];
      }

      enrolledCount = Math.max(0, enrolledCount - 1);

      let nextStatus = status;
      let nextPhase = current.phase || 'waiting';
      let countdownStartAt = current.countdownStartAt || null;
      let countdownEndsAt = current.countdownEndsAt || null;
      let lastSystemNotice = current.lastSystemNotice || null;

      if (status === 'countdown' && enrolledCount < Number(current.maxParticipants || 6)) {
        nextStatus = 'waiting';
        nextPhase = 'waiting';
        countdownStartAt = null;
        countdownEndsAt = null;
        lastSystemNotice = {
          type: 'countdown_canceled',
          ts: now,
          text: 'Inscricao alterada. Countdown cancelado',
          eventId: `countdown_cancel_${current.instanceId || instance.instanceId}_${now}`,
        };
      }

      return {
        ...current,
        enrolledUsers,
        activePlayers,
        enrolledCount,
        status: nextStatus,
        phase: nextPhase,
        countdownStartAt,
        countdownEndsAt,
        lastSystemNotice,
        updatedAt: now,
      };
    });

    const updated = result.snapshot.exists()
      ? { instanceId: instance.instanceId, ...result.snapshot.val() }
      : null;

    if (!updated?.enrolledUsers?.[uid]) {
      await this.#clearEnrollmentIndex(tournamentId, uid);
      return { left: true, instanceId: instance.instanceId };
    }

    return { left: false, instanceId: instance.instanceId, reason: 'instance_active' };
  }

  /**
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<{instance: Object|null}>}
   * @private
   */
  async #resolveIndexedEnrollment(tournamentId, uid) {
    const { db, dbMod } = this.#getDbContext();
    const indexRef = dbMod.ref(db, this.#buildEnrollmentIndexPath(tournamentId, uid));
    const indexSnap = await dbMod.get(indexRef);

    if (!indexSnap.exists()) {
      return { instance: null };
    }

    const indexed = indexSnap.val() || {};
    const instanceId = indexed.instanceId || null;
    if (!instanceId) {
      return { instance: null };
    }

    const instance = await this.getInstanceById(instanceId);
    const isValid = !!(instance?.enrolledUsers?.[uid] && (instance.status || 'waiting') !== 'finished');

    if (!isValid) {
      await dbMod.remove(indexRef);
      return { instance: null };
    }

    return { instance };
  }

  /**
   * @param {string} tournamentId
   * @param {string} uid
   * @param {string} claimToken
   * @returns {Promise<{claimed: boolean, alreadyEnrolledInstanceId: string|null}>}
   * @private
   */
  async #acquireEnrollmentClaim(tournamentId, uid, claimToken) {
    const { db, dbMod } = this.#getDbContext();
    const indexRef = dbMod.ref(db, this.#buildEnrollmentIndexPath(tournamentId, uid));
    const claimTtlMs = 15_000;

    const result = await dbMod.runTransaction(indexRef, (current) => {
      const now = Date.now();
      const currentInstanceId = current?.instanceId || null;
      const currentPendingToken = current?.pendingToken || null;
      const claimTs = Number(current?.claimTs || 0);
      const hasFreshPending = !!(currentPendingToken && (now - claimTs) < claimTtlMs);

      if (currentInstanceId) {
        return current;
      }

      if (hasFreshPending && currentPendingToken !== claimToken) {
        return current;
      }

      return {
        uid,
        tournamentId,
        pendingToken: claimToken,
        claimTs: now,
        updatedAt: now,
      };
    });

    const value = result.snapshot.val() || null;
    if (!value) {
      return { claimed: false, alreadyEnrolledInstanceId: null };
    }

    return {
      claimed: value.pendingToken === claimToken,
      alreadyEnrolledInstanceId: value.instanceId || null,
    };
  }

  /**
   * @param {string} tournamentId
   * @param {string} uid
   * @param {string} claimToken
   * @returns {Promise<void>}
   * @private
   */
  async #releaseEnrollmentClaim(tournamentId, uid, claimToken) {
    if (!claimToken) return;
    const { db, dbMod } = this.#getDbContext();
    const indexRef = dbMod.ref(db, this.#buildEnrollmentIndexPath(tournamentId, uid));

    await dbMod.runTransaction(indexRef, (current) => {
      if (!current) return current;
      if (current.instanceId) return current;
      if (current.pendingToken !== claimToken) return current;
      return null;
    });
  }

  /**
   * @param {string} tournamentId
   * @param {string} uid
   * @param {string} instanceId
   * @returns {Promise<void>}
   * @private
   */
  async #setEnrollmentIndex(tournamentId, uid, instanceId) {
    if (!instanceId) return;
    const { db, dbMod } = this.#getDbContext();
    const now = Date.now();
    const indexRef = dbMod.ref(db, this.#buildEnrollmentIndexPath(tournamentId, uid));
    await dbMod.set(indexRef, {
      uid,
      tournamentId,
      instanceId,
      updatedAt: now,
    });
  }

  /**
   * @param {string} tournamentId
   * @param {string} uid
   * @returns {Promise<void>}
   * @private
   */
  async #clearEnrollmentIndex(tournamentId, uid) {
    const { db, dbMod } = this.#getDbContext();
    const indexRef = dbMod.ref(db, this.#buildEnrollmentIndexPath(tournamentId, uid));
    await dbMod.remove(indexRef);
  }

  /**
   * Ativa torneio se countdown acabou (idempotente).
   * @param {string} tournamentId
   * @returns {Promise<boolean>} true se ficou ativo
   */
  async startTournamentIfCountdownElapsed(tournamentId) {
    const instances = await this.getInstancesByTournament(tournamentId);
    let startedAny = false;

    for (const instance of instances) {
      if (instance.status === 'countdown') {
        const started = await this.startInstanceIfCountdownElapsed(instance.instanceId);
        if (started) startedAny = true;
      }
    }

    return startedAny;
  }

  /**
   * Inicia a instância ao fim do countdown (idempotente).
   * Também cria a primeira partida de forma idempotente.
   * @param {string} instanceId
   * @returns {Promise<{started: boolean, instance: Object|null}>}
   */
  async startInstanceIfCountdownElapsed(instanceId) {
    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `tournaments/instances/${instanceId}`);

    let shouldCreateMatch = false;
    let newMatchId = null;

    const result = await dbMod.runTransaction(ref, (current) => {
      if (!current) return current;

      const now = Date.now();
      const status = current.status || 'waiting';
      const endAt = Number(current.countdownEndsAt || 0);

      if (status === 'finished') return current;

      if (status === 'active') {
        return {
          ...current,
          updatedAt: now,
        };
      }

      if (status !== 'countdown' || endAt <= 0 || now < endAt) {
        return current;
      }

      const enrolledUsers = { ...(current.enrolledUsers || {}) };
      const activePlayers = Object.keys(current.activePlayers || {}).length > 0
        ? { ...(current.activePlayers || {}) }
        : { ...enrolledUsers };

      const matchNumber = Number(current.currentMatchNumber || 0) > 0
        ? Number(current.currentMatchNumber || 1)
        : 1;
      const currentMatchId = current.currentMatchId || this.#buildMatchId(instanceId, matchNumber);

      shouldCreateMatch = true;
      newMatchId = currentMatchId;

      return {
        ...current,
        status: 'active',
        phase: `round_${matchNumber}`,
        startedAt: current.startedAt || now,
        currentMatchId,
        currentMatchNumber: matchNumber,
        activePlayers,
        eliminatedPlayers: { ...(current.eliminatedPlayers || {}) },
        processedMatchResults: { ...(current.processedMatchResults || {}) },
        lastSystemNotice: {
          type: 'active_started',
          ts: now,
          text: 'Combate iniciado',
          eventId: `active_${instanceId}_${now}`,
        },
        updatedAt: now,
      };
    });

    const instance = result.snapshot.exists()
      ? { instanceId, ...result.snapshot.val() }
      : null;

    if (shouldCreateMatch && newMatchId && instance) {
      await this.ensureTournamentMatch(newMatchId, {
        tournamentId: instance.tournamentId,
        instanceId,
        matchNumber: Number(instance.currentMatchNumber || 1),
        playersMap: instance.activePlayers || {},
      });
      console.log(`[TournamentRound] instance started instanceId=${instanceId} matchId=${newMatchId}`);
    }

    return {
      started: instance?.status === 'active',
      instance,
    };
  }

  /**
   * Registra resultado da partida (eliminado com mico) e avança para próxima fase.
   * Idempotente por matchId.
   * @param {string} instanceId
   * @param {{matchId: string, micoUid: string, pairCounts?: Object}} payload
   * @returns {Promise<Object|null>}
   */
  async reportMatchResult(instanceId, payload) {
    const { db, dbMod } = this.#getDbContext();
    const matchId = payload?.matchId;
    const micoUid = payload?.micoUid;
    if (!matchId || !micoUid) {
      throw new Error('[TournamentRound] reportMatchResult requer matchId e micoUid');
    }

    const ref = dbMod.ref(db, `tournaments/instances/${instanceId}`);
    let nextMatchIdToCreate = null;

    const result = await dbMod.runTransaction(ref, (current) => {
      if (!current) return current;

      const now = Date.now();
      const status = current.status || 'waiting';
      if (status === 'finished') return current;

      const processed = { ...(current.processedMatchResults || {}) };
      if (processed[matchId]) {
        return current;
      }

      if (current.currentMatchId !== matchId) {
        return current;
      }

      const activePlayers = { ...(current.activePlayers || current.enrolledUsers || {}) };
      const eliminatedPlayers = { ...(current.eliminatedPlayers || {}) };

      if (!activePlayers[micoUid]) {
        processed[matchId] = {
          ts: now,
          ignored: true,
          reason: 'mico_uid_not_active',
        };
        return {
          ...current,
          processedMatchResults: processed,
          updatedAt: now,
        };
      }

      const loserData = { ...(activePlayers[micoUid] || {}), eliminatedAt: now, eliminatedByMatchId: matchId };
      delete activePlayers[micoUid];
      eliminatedPlayers[micoUid] = loserData;

      processed[matchId] = {
        ts: now,
        micoUid,
      };

      const survivors = Object.keys(activePlayers);
      if (survivors.length <= 1) {
        return {
          ...current,
          activePlayers,
          eliminatedPlayers,
          processedMatchResults: processed,
          status: 'finished',
          phase: 'finished',
          championUid: survivors[0] || null,
          finishedAt: now,
          currentMatchId: null,
          lastSystemNotice: {
            type: 'champion_defined',
            ts: now,
            text: 'Campeonato encerrado',
            eventId: `champion_${instanceId}_${now}`,
          },
          updatedAt: now,
        };
      }

      const nextMatchNumber = Number(current.currentMatchNumber || 1) + 1;
      const nextMatchId = this.#buildMatchId(instanceId, nextMatchNumber);
      nextMatchIdToCreate = nextMatchId;

      return {
        ...current,
        activePlayers,
        eliminatedPlayers,
        processedMatchResults: processed,
        status: 'active',
        phase: `round_${nextMatchNumber}`,
        currentMatchId: nextMatchId,
        currentMatchNumber: nextMatchNumber,
        lastSystemNotice: {
          type: 'next_match_ready',
          ts: now,
          text: `Proxima partida da fase ${nextMatchNumber}`,
          eventId: `next_match_${instanceId}_${nextMatchNumber}_${now}`,
        },
        updatedAt: now,
      };
    });

    if (!result.snapshot.exists()) return null;

    const updatedInstance = { instanceId, ...result.snapshot.val() };

    if (updatedInstance.status === 'finished') {
      const enrolledUsers = updatedInstance.enrolledUsers || {};
      const activePlayers = updatedInstance.activePlayers || {};
      const eliminatedPlayers = updatedInstance.eliminatedPlayers || {};
      const uids = new Set([
        ...Object.keys(enrolledUsers),
        ...Object.keys(activePlayers),
        ...Object.keys(eliminatedPlayers),
      ]);

      if (uids.size > 0) {
        const updates = {};
        const tournamentId = updatedInstance.tournamentId || null;
        if (tournamentId) {
          for (const uid of uids) {
            updates[`tournaments/enrollmentIndex/${tournamentId}/${uid}`] = null;
          }
          await dbMod.update(dbMod.ref(db), updates);
        }
      }

      if (updatedInstance.tournamentId) {
        await this.ensureJoinableInstance(updatedInstance.tournamentId, {
          maxParticipants: updatedInstance.maxParticipants,
        });
      }
    }

    if (nextMatchIdToCreate && updatedInstance.status === 'active') {
      await this.ensureTournamentMatch(nextMatchIdToCreate, {
        tournamentId: updatedInstance.tournamentId,
        instanceId,
        matchNumber: Number(updatedInstance.currentMatchNumber || 1),
        playersMap: updatedInstance.activePlayers || {},
      });
      console.log(`[TournamentRound] next match created instanceId=${instanceId} matchId=${nextMatchIdToCreate}`);
    }

    return updatedInstance;
  }

  /**
   * Cria a partida do campeonato em /matches/{matchId} (idempotente).
   * @param {string} matchId
   * @param {{tournamentId: string, instanceId: string, matchNumber: number, playersMap: Object}} data
   * @returns {Promise<void>}
   */
  async ensureTournamentMatch(matchId, data) {
    const { db, dbMod } = this.#getDbContext();
    const metaRef = dbMod.ref(db, `matches/${matchId}/meta`);
    const metaSnap = await dbMod.get(metaRef);
    if (metaSnap.exists()) return;

    const now = Date.now();
    const playersMap = data?.playersMap || {};
    const playerIds = Object.keys(playersMap);

    if (!playerIds.length) {
      console.warn(`[TournamentRound] ensureTournamentMatch sem jogadores matchId=${matchId}`);
      return;
    }

    const metaPayload = {
      matchId,
      lobbyType: 'tournament',
      maxPlayers: playerIds.length,
      playerIds,
      state: 'pending',
      status: 'pending',
      joinedCount: 0,
      createdAt: now,
      createdTs: now,
      meta: {
        tournamentId: data?.tournamentId || null,
        tournamentInstanceId: data?.instanceId || null,
        tournamentMatchNumber: Number(data?.matchNumber || 1),
      },
    };

    const playersPayload = {};
    for (const [uid, value] of Object.entries(playersMap)) {
      playersPayload[uid] = {
        uid,
        name: value?.name || 'Jogador',
        avatarUrl: value?.avatarUrl || '',
        joinedAt: Number(value?.joinedAt || now),
      };
    }

    await dbMod.update(dbMod.ref(db), {
      [`matches/${matchId}/meta`]: metaPayload,
      [`matches/${matchId}/meta/players`]: playersPayload,
      [`matches/${matchId}/state`]: 'pending',
    });
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
        if (pB !== pA) return pB - pA;
        const pairsA = Number(a.score?.pairs || 0);
        const pairsB = Number(b.score?.pairs || 0);
        return pairsB - pairsA;
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
        pointsMilli: this.#clampPointsMilli(Number(base.pointsMilli || 0) + milliDelta),
        pairs: Number(base.pairs || 0) + 1,
        decisivePairs: Number(base.decisivePairs || 0) + (payload?.isDecisive ? 1 : 0),
        processedEvents,
        updatedAt: now,
        lastEventAt: now,
      };
    });

    return result.snapshot.exists() ? result.snapshot.val() : null;
  }

  /**
  * Aplica penalidade ao jogador que terminou com o mico.
  * Regra: -0.02 por par formado na partida (20 milli por par).
   * @param {string} tournamentId
  * @param {{uid: string, name?: string, avatarUrl?: string, pairCount: number, penaltyPerPairMilli?: number, eventId: string}} payload
   * @returns {Promise<Object|null>}
   */
  async applyMicoPairPenalty(tournamentId, payload) {
    const { db, dbMod } = this.#getDbContext();
    const uid = payload?.uid;
    const eventId = payload?.eventId;
    const pairCount = Math.max(0, Number(payload?.pairCount || 0));
    if (!uid || !eventId || pairCount <= 0) {
      return null;
    }

    const penaltyPerPairMilli = Math.max(0, Number(payload?.penaltyPerPairMilli || 20));
    const penaltyMilli = pairCount * penaltyPerPairMilli;
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
        micoLosses: 0,
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
        pointsMilli: this.#clampPointsMilli(Number(base.pointsMilli || 0) - penaltyMilli),
        micoLosses: Number(base.micoLosses || 0) + 1,
        processedEvents,
        updatedAt: now,
        lastEventAt: now,
      };
    });

    return result.snapshot.exists() ? result.snapshot.val() : null;
  }

  /**
   * Registra estatística no ranking geral (somente partidas fora de campeonato).
   * @param {{uid: string, name?: string, avatarUrl?: string, matchId: string, pairs?: number, won?: boolean, eventTs?: number}} payload
   * @returns {Promise<Object|null>}
   */
  async recordGeneralMatchStats(payload) {
    const uid = payload?.uid;
    const matchId = payload?.matchId;
    if (!uid || !matchId) {
      throw new Error('[Ranking] recordGeneralMatchStats requer uid e matchId');
    }

    const { db, dbMod } = this.#getDbContext();
    const ref = dbMod.ref(db, `rankings/general/${uid}`);
    const pairs = Math.max(0, Number(payload?.pairs || 0));
    const won = !!payload?.won;
    const lostWithMico = !!payload?.lostWithMico;
    const pointsMilliDelta = (pairs * 30) - (lostWithMico ? pairs * 20 : 0);
    const eventId = `match_${matchId}`;

    const result = await dbMod.runTransaction(ref, (current) => {
      const now = Number(payload?.eventTs || Date.now());
      const base = current || {
        uid,
        name: payload?.name || 'Jogador',
        avatarUrl: payload?.avatarUrl || '',
        totalPointsMilli: 0,
        totalPairs: 0,
        wins: 0,
        micoLosses: 0,
        matches: 0,
        processedMatches: {},
        createdAt: now,
      };

      const processedMatches = { ...(base.processedMatches || {}) };
      if (processedMatches[eventId]) {
        return base;
      }

      processedMatches[eventId] = now;
      const keys = Object.keys(processedMatches);
      if (keys.length > 240) {
        keys
          .sort((a, b) => Number(processedMatches[a] || 0) - Number(processedMatches[b] || 0))
          .slice(0, keys.length - 180)
          .forEach((key) => delete processedMatches[key]);
      }

      return {
        ...base,
        uid,
        name: payload?.name || base.name || 'Jogador',
        avatarUrl: payload?.avatarUrl ?? base.avatarUrl ?? '',
        totalPointsMilli: Number(base.totalPointsMilli || 0) + pointsMilliDelta,
        totalPairs: Number(base.totalPairs || 0) + pairs,
        wins: Number(base.wins || 0) + (won ? 1 : 0),
        micoLosses: Number(base.micoLosses || 0) + (lostWithMico ? 1 : 0),
        matches: Number(base.matches || 0) + 1,
        processedMatches,
        updatedAt: now,
        lastMatchAt: now,
      };
    });

    return result.snapshot.exists() ? result.snapshot.val() : null;
  }

  /**
   * Observa ranking geral Top N em tempo real.
   * @param {number} limit
   * @param {(rows: Array<Object>) => void} callback
   * @returns {Function}
   */
  subscribeGeneralLeaderboard(limit, callback) {
    const { db, dbMod } = this.#getDbContext();
    const safeLimit = Math.max(1, Number(limit || 100));
    const ref = dbMod.ref(db, 'rankings/general');

    const unsubscribe = dbMod.onValue(ref, (snap) => {
      const map = snap.exists() ? (snap.val() || {}) : {};
      const rows = Object.entries(map)
        .map(([uid, row]) => ({
          uid,
          name: row?.name || 'Jogador',
          avatarUrl: row?.avatarUrl || '',
          totalPointsMilli: Number(row?.totalPointsMilli || 0),
          totalPairs: Number(row?.totalPairs || 0),
          wins: Number(row?.wins || 0),
          micoLosses: Number(row?.micoLosses || 0),
          matches: Number(row?.matches || 0),
          updatedAt: Number(row?.updatedAt || 0),
        }))
        .sort((a, b) => {
          if (b.totalPointsMilli !== a.totalPointsMilli) return b.totalPointsMilli - a.totalPointsMilli;
          if (b.wins !== a.wins) return b.wins - a.wins;
          if (b.totalPairs !== a.totalPairs) return b.totalPairs - a.totalPairs;
          return b.updatedAt - a.updatedAt;
        })
        .slice(0, safeLimit)
        .map((row, index) => ({ ...row, rank: index + 1 }));

      callback(rows);
    }, (error) => {
      console.error('[Ranking] subscribeGeneralLeaderboard error:', error);
    });

    return () => unsubscribe();
  }
}
