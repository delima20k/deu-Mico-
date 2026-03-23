/**
 * @layer services
 * @group tournament
 * @role Service
 * @depends TournamentRepository, AuthService
 * @exports TournamentService
 *
 * Regras do campeonato em tempo real.
 * - Participacao em torneio + countdown idempotente
 * - Ranking Top 50 em tempo real
 * - Pontuacao normalizada em miliesimos para evitar erro de float
 */
import { TournamentRepository } from '../repositories/TournamentRepository.js';
import { AuthService } from './AuthService.js';

export class TournamentService {
  /** @type {TournamentService|null} */
  static #instance = null;

  static DEFAULT_TOURNAMENT_ID = '2026_march_1';
  static DEFAULT_MAX_PARTICIPANTS = 6;
  static COUNTDOWN_MS = 60_000;

  // Normalizacao de pontos: 100 = 0.1 ponto, 300 = 0.3 pontos.
  static POINTS_COMMON_PAIR_MILLI = 100;
  static POINTS_DECISIVE_PAIR_MILLI = 300;

  /** @type {TournamentRepository} */
  #repo;

  /** @type {AuthService} */
  #authService;

  /** @type {string|null} */
  #currentTournamentId = null;

  /** @type {string|null} */
  #currentInstanceId = null;

  static getInstance() {
    if (!TournamentService.#instance) {
      TournamentService.#instance = new TournamentService(
        TournamentRepository.getInstance(),
        AuthService.getInstance()
      );
    }
    return TournamentService.#instance;
  }

  constructor(repo, authService) {
    this.#repo = repo;
    this.#authService = authService;
  }

  /**
   * Garante que exista um torneio atual no Firebase.
   * @returns {Promise<string>} tournamentId
   */
  async ensureCurrentTournament() {
    if (this.#currentTournamentId) {
      return this.#currentTournamentId;
    }

    const fromDb = await this.#repo.getCurrentTournamentId();
    const tournamentId = fromDb || TournamentService.DEFAULT_TOURNAMENT_ID;

    await this.#repo.ensureTournament(tournamentId, {
      name: 'Campeonato de Marco 2026',
      prize: 'Premiacao especial Deu Mico',
      maxParticipants: TournamentService.DEFAULT_MAX_PARTICIPANTS,
      status: 'waiting',
    });

    this.#currentTournamentId = tournamentId;
    console.log(`[Tournament] current tournamentId=${tournamentId}`);
    return tournamentId;
  }

  /**
   * @returns {Promise<string>}
   */
  async getCurrentTournamentId() {
    return this.ensureCurrentTournament();
  }

  /**
   * Observa estado realtime do torneio atual.
   * @param {(state: Object|null) => void} callback
   * @returns {Promise<Function>} unsubscribe
   */
  async subscribeCurrentTournament(callback) {
    const tournamentId = await this.ensureCurrentTournament();
    const currentUser = await this.#authService.getCurrentUser().catch(() => null);
    let myUid = currentUser?.uid || null;

    const unsubAuth = this.#authService.onAuthStateChanged((user) => {
      myUid = user?.uid || null;
    });

    const unsubInstances = this.#repo.subscribeTournamentInstances(tournamentId, (instances) => {
      const list = Array.isArray(instances) ? instances : [];

      const myInstance = myUid
        ? list.find((instance) => {
          const hasMe = !!instance?.enrolledUsers?.[myUid];
          const status = instance?.status || 'waiting';
          return hasMe && status !== 'finished';
        }) || null
        : null;

      const waitingJoinable = list.find((instance) => {
        const status = instance?.status || 'waiting';
        const count = Number(instance?.enrolledCount || 0);
        const max = Number(instance?.maxParticipants || TournamentService.DEFAULT_MAX_PARTICIPANTS);
        return status === 'waiting' && count < max;
      }) || null;

      const selectedInstance = myInstance || waitingJoinable || list[0] || null;
      if (selectedInstance?.instanceId) {
        this.#currentInstanceId = selectedInstance.instanceId;
      }

      callback({
        tournamentId,
        myUid,
        instances: list,
        myInstance,
        joinableInstance: waitingJoinable,
        selectedInstance,
      });
    });

    return () => {
      unsubInstances?.();
      unsubAuth?.();
    };
  }

  /**
   * Participa do torneio atual (atomico).
   * @returns {Promise<{joined: boolean, alreadyJoined: boolean, tournament: Object|null}>}
   */
  async joinCurrentTournament() {
    const tournamentId = await this.ensureCurrentTournament();
    const currentUser = await this.#authService.getCurrentUser();

    if (!currentUser?.uid) {
      throw new Error('[Tournament] Usuario nao autenticado para participar');
    }

    const profile = await this.#authService.getProfile(currentUser.uid).catch(() => null);

    const userData = {
      uid: currentUser.uid,
      name: profile?.displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'Jogador',
      avatarUrl: profile?.avatarUrl || currentUser.photoURL || '',
    };

    console.log(`[Tournament] join request uid=${currentUser.uid.slice(0, 8)}... tournamentId=${tournamentId}`);

    const result = await this.#repo.joinTournament(tournamentId, userData, {
      countdownDurationMs: TournamentService.COUNTDOWN_MS,
      maxParticipants: TournamentService.DEFAULT_MAX_PARTICIPANTS,
    });

    if (result?.instanceId) {
      this.#currentInstanceId = result.instanceId;
    }

    return result;
  }

  /**
   * Tenta iniciar torneio apos countdown (idempotente).
   * @returns {Promise<boolean>}
   */
  async startIfCountdownElapsed() {
    const tournamentId = await this.ensureCurrentTournament();

    let instanceId = this.#currentInstanceId;
    if (!instanceId) {
      const currentUser = await this.#authService.getCurrentUser().catch(() => null);
      const enrolled = await this.#repo.findUserEnrollment(tournamentId, currentUser?.uid || '');
      instanceId = enrolled.instance?.instanceId || null;
    }

    if (!instanceId) {
      const startedAny = await this.#repo.startTournamentIfCountdownElapsed(tournamentId);
      return {
        started: startedAny,
        instance: null,
      };
    }

    return this.#repo.startInstanceIfCountdownElapsed(instanceId);
  }

  /**
   * @param {string} instanceId
   * @returns {Promise<Object|null>}
   */
  async getInstanceById(instanceId) {
    if (!instanceId) return null;
    return this.#repo.getInstanceById(instanceId);
  }

  /**
   * @param {string} instanceId
   * @param {(state: Object|null) => void} callback
   * @returns {Function}
   */
  subscribeTournamentInstance(instanceId, callback) {
    return this.#repo.subscribeTournamentInstance(instanceId, callback);
  }

  /**
   * Processa fim de partida (mico eliminado) e avança rodada.
   * @param {{instanceId: string, matchId: string, micoUid: string, pairCounts?: Object}} payload
   * @returns {Promise<Object|null>}
   */
  async reportMatchResult(payload) {
    if (!payload?.instanceId || !payload?.matchId || !payload?.micoUid) {
      return null;
    }

    console.log(
      `[TournamentRound] report result instanceId=${payload.instanceId} ` +
      `matchId=${payload.matchId} micoUid=${payload.micoUid.slice(0, 8)}...`
    );

    return this.#repo.reportMatchResult(payload.instanceId, {
      matchId: payload.matchId,
      micoUid: payload.micoUid,
      pairCounts: payload.pairCounts || {},
    });
  }

  /**
   * Observa ranking Top 50 em tempo real.
   * @param {(rows: Array<Object>) => void} callback
   * @returns {Promise<Function>} unsubscribe
   */
  async subscribeLeaderboardTop50(callback) {
    const tournamentId = await this.ensureCurrentTournament();

    return this.#repo.subscribeLeaderboard(tournamentId, (leaderboardMap) => {
      const rows = Object.entries(leaderboardMap || {})
        .map(([uid, row]) => {
          const pointsMilli = Number(row?.pointsMilli || 0);
          return {
            uid,
            name: row?.name || 'Jogador',
            avatarUrl: row?.avatarUrl || '',
            pointsMilli,
            points: (pointsMilli / 1000).toFixed(1),
            pairs: Number(row?.pairs || 0),
            decisivePairs: Number(row?.decisivePairs || 0),
          };
        })
        .sort((a, b) => {
          if (b.pointsMilli !== a.pointsMilli) return b.pointsMilli - a.pointsMilli;
          return Number(b.pairs || 0) - Number(a.pairs || 0);
        })
        .slice(0, 50)
        .map((entry, index) => ({ ...entry, rank: index + 1 }));

      callback(rows);
    });
  }

  /**
   * Pontua um par formado no ranking do campeonato.
   * Regra:
   * - par comum: +0.1 => 100 milli
   * - par decisivo/final: +0.3 => 300 milli
   *
   * @param {{uid: string, name?: string, avatarUrl?: string, matchId: string, cardIds: string[], eventTs?: number, isDecisive?: boolean}} data
   * @returns {Promise<void>}
   */
  async awardPairPoints(data) {
    if (!data?.uid || !data?.matchId || !Array.isArray(data.cardIds) || data.cardIds.length < 2) {
      return;
    }

    const tournamentId = await this.ensureCurrentTournament();
    const eventTs = data.eventTs || Date.now();
    const cardSignature = [...data.cardIds].sort().join('_');
    const eventId = `${data.matchId}_${data.uid}_${cardSignature}_${eventTs}`;
    const isDecisive = !!data.isDecisive;

    const milliDelta = isDecisive
      ? TournamentService.POINTS_DECISIVE_PAIR_MILLI
      : TournamentService.POINTS_COMMON_PAIR_MILLI;

    console.log(
      `[Ranking] award uid=${data.uid.slice(0, 8)}... deltaMilli=${milliDelta} ` +
      `decisive=${isDecisive} eventId=${eventId}`
    );

    await this.#repo.addPairPoints(tournamentId, {
      uid: data.uid,
      name: data.name || 'Jogador',
      avatarUrl: data.avatarUrl || '',
      milliDelta,
      eventId,
      isDecisive,
    });
  }
}
