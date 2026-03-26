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

  // Nova escala: +0.03 por par (30 milli).
  static POINTS_COMMON_PAIR_MILLI = 30;
  static POINTS_DECISIVE_PAIR_MILLI = 30;
  // Penalidade do mico no fim da partida: -0.02 por par feito (20 milli/par).
  static MICO_PENALTY_PER_PAIR_MILLI = 20;

  /** @type {TournamentRepository} */
  #repo;

  /** @type {AuthService} */
  #authService;

  /** @type {string|null} */
  #currentTournamentId = null;

  /** @type {string|null} */
  #currentInstanceId = null;

  /** @type {Set<string>} matchIds que o usuário saiu voluntariamente (persistido em localStorage) */
  #userLeftMatchIds = new Set();

  static #STORAGE_KEY = 'deu-mico:leftTournamentMatchIds';

  /** @type {boolean} */
  #ensuringJoinableInstance = false;

  /**
   * Registra que o usuário saiu voluntariamente de uma partida.
   * Persiste em localStorage para sobreviver a refreshes.
   * @param {string} matchId
   */
  recordUserLeftMatch(matchId) {
    if (!matchId) return;
    this.#userLeftMatchIds.add(matchId);
    try {
      const stored = JSON.parse(localStorage.getItem(TournamentService.#STORAGE_KEY) || '[]');
      if (!stored.includes(matchId)) {
        stored.push(matchId);
        // Mantém no máximo 50 entradas para não crescer indefinidamente
        const trimmed = stored.slice(-50);
        localStorage.setItem(TournamentService.#STORAGE_KEY, JSON.stringify(trimmed));
      }
    } catch (_) { /* localStorage indisponível — sem problema, funciona apenas na sessão */ }
  }

  /**
   * Verifica se o usuário saiu voluntariamente de uma partida.
   * @param {string} matchId
   * @returns {boolean}
   */
  wasMatchLeftByUser(matchId) {
    return !!matchId && this.#userLeftMatchIds.has(matchId);
  }

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
    // Carrega partidas "saídas" do localStorage para bloquear redirects entre refreshes
    try {
      const stored = JSON.parse(localStorage.getItem(TournamentService.#STORAGE_KEY) || '[]');
      if (Array.isArray(stored)) stored.forEach((id) => this.#userLeftMatchIds.add(id));
    } catch (_) { /* localStorage indisponível — começa com set vazio */ }
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

      // Instâncias stale detectadas neste ciclo para limpeza assíncrona
      const staleInstancesForUid = [];

      const myInstance = myUid
        ? list.find((instance) => {
          const hasMe = !!instance?.enrolledUsers?.[myUid];
          const status = instance?.status || 'waiting';
          if (!hasMe || status === 'finished') return false;
          // Se a instância está ativa, o usuário precisa estar em activePlayers
          // Caso contrário é uma inscrição stale (sobrou de partida anterior)
          if (status === 'active') {
            const isActivePlayer = !!instance?.activePlayers?.[myUid];
            if (!isActivePlayer) {
              staleInstancesForUid.push({ instanceId: instance.instanceId, strategy: 'clear-index' });
              return false;
            }
          }

          // Usuário que não confirmou presença no countdown não deve ficar preso
          // na rodada lotada ao voltar para se inscrever novamente.
          if (status === 'countdown' && instance?.confirmationRequired) {
            const confirmed = !!instance?.presenceConfirmations?.[myUid]?.confirmed;
            if (!confirmed) {
              staleInstancesForUid.push({ instanceId: instance.instanceId, strategy: 'leave-countdown' });
              return false;
            }
          }
          return true;
        }) || null
        : null;

      // Limpa enrollmentIndex de instâncias stale em background
      if (myUid && staleInstancesForUid.length > 0) {
        staleInstancesForUid.forEach(({ instanceId, strategy }) => {
          console.log(`[TournamentService] Limpando inscrição stale uid=${myUid} instanceId=${instanceId} strategy=${strategy}`);

          if (strategy === 'leave-countdown') {
            this.#repo.leaveTournament(tournamentId, myUid).catch((err) => {
              console.warn('[TournamentService] Falha ao remover inscrição stale do countdown:', err);
            });
            return;
          }

          this.#repo.removeEnrollmentIndex(tournamentId, myUid).catch((err) => {
            console.warn('[TournamentService] Falha ao limpar enrollmentIndex stale:', err);
          });
        });
      }

      const waitingJoinable = list.find((instance) => {
        const status = instance?.status || 'waiting';
        const count = Number(instance?.enrolledCount || 0);
        const max = Number(instance?.maxParticipants || TournamentService.DEFAULT_MAX_PARTICIPANTS);
        return status === 'waiting' && count < max;
      }) || null;

      if (!waitingJoinable && !this.#ensuringJoinableInstance) {
        this.#ensuringJoinableInstance = true;
        this.#repo.ensureJoinableInstance(tournamentId, {
          maxParticipants: TournamentService.DEFAULT_MAX_PARTICIPANTS,
        }).catch((error) => {
          console.warn('[TournamentRound] Falha ao garantir nova instancia waiting:', error);
        }).finally(() => {
          this.#ensuringJoinableInstance = false;
        });
      }

      const selectedInstance = myInstance || waitingJoinable || null;
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
      name: profile?.name || currentUser.displayName || currentUser.email?.split('@')[0] || 'Jogador',
      avatarUrl: profile?.avatarUrl || currentUser.photoURL || '',
    };

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
   * Remove a inscrição do usuário atual na instância ativa do campeonato.
   * @returns {Promise<{left: boolean, instanceId: string|null, reason?: string}>}
   */
  async leaveCurrentTournament() {
    const tournamentId = await this.ensureCurrentTournament();
    const currentUser = await this.#authService.getCurrentUser();

    if (!currentUser?.uid) {
      throw new Error('[Tournament] Usuario nao autenticado para desistir');
    }

    return this.#repo.leaveTournament(tournamentId, currentUser.uid);
  }

  /**
   * Confirma presença do usuário atual na instância em countdown.
   * @param {string} instanceId
   * @returns {Promise<{confirmed: boolean, instance: Object|null}>}
   */
  async confirmCurrentTournamentPresence(instanceId) {
    const currentUser = await this.#authService.getCurrentUser();
    if (!currentUser?.uid) {
      throw new Error('[Tournament] Usuario nao autenticado para confirmar presenca');
    }
    return this.#repo.confirmPresence(instanceId, currentUser.uid);
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
            points: (pointsMilli / 1000).toFixed(2),
            pairs: Number(row?.pairs || 0),
            decisivePairs: Number(row?.decisivePairs || 0),
            micoLosses: Number(row?.micoLosses || 0),
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
  * - par comum/final: +0.03 => 30 milli
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

  /**
  * Aplica penalidade ao jogador que terminou com o mico:
  * -0.02 por par feito na partida.
   * @param {{matchId: string, micoUid: string, pairCounts?: Record<string, number>, playersMap?: Record<string, {name?: string, avatarUrl?: string}>}} data
   * @returns {Promise<void>}
   */
  async applyMicoPenaltyAfterMatch(data) {
    const micoUid = data?.micoUid;
    const matchId = data?.matchId;
    if (!micoUid || !matchId) return;

    const pairCount = Math.max(0, Number(data?.pairCounts?.[micoUid] || 0));
    if (pairCount <= 0) return;

    const tournamentId = await this.ensureCurrentTournament();
    const player = data?.playersMap?.[micoUid] || null;
    const eventId = `mico_penalty_${matchId}_${micoUid}`;

    await this.#repo.applyMicoPairPenalty(tournamentId, {
      uid: micoUid,
      name: player?.name || 'Jogador',
      avatarUrl: player?.avatarUrl || '',
      pairCount,
      penaltyPerPairMilli: TournamentService.MICO_PENALTY_PER_PAIR_MILLI,
      eventId,
    });
  }

  /**
   * Registra estatística no ranking geral (partidas fora de campeonato).
  * @param {{uid: string, name?: string, avatarUrl?: string, matchId: string, pairs?: number, won?: boolean, lostWithMico?: boolean, eventTs?: number}} data
   * @returns {Promise<void>}
   */
  async recordGeneralMatchResult(data) {
    if (!data?.uid || !data?.matchId) return;

    await this.#repo.recordGeneralMatchStats({
      uid: data.uid,
      name: data.name || 'Jogador',
      avatarUrl: data.avatarUrl || '',
      matchId: data.matchId,
      pairs: Number(data.pairs || 0),
      won: !!data.won,
      lostWithMico: !!data.lostWithMico,
      eventTs: Number(data.eventTs || Date.now()),
    });
  }

  /**
   * Observa Top 100 do ranking geral (fora de campeonato).
   * @param {(rows: Array<Object>) => void} callback
   * @returns {Function}
   */
  subscribeGeneralLeaderboardTop100(callback) {
    return this.#repo.subscribeGeneralLeaderboard(100, (rows) => {
      callback(rows.map((entry) => ({
        ...entry,
        totalPoints: (Number(entry.totalPointsMilli || 0) / 1000).toFixed(2),
        avgPairs: entry.matches > 0
          ? (Number(entry.totalPairs || 0) / Number(entry.matches || 1)).toFixed(2)
          : '0.00',
      })));
    });
  }

  /**
   * Elimina um jogador que saiu de uma partida ativa de torneio.
   * @param {{instanceId: string, uid: string, matchId: string}} payload
   * @returns {Promise<{eliminated: boolean, instance: Object|null, shouldAdvance: boolean}>}
   */
  async eliminatePlayerWhoLeftMatch(payload) {
    if (!payload?.instanceId || !payload?.uid || !payload?.matchId) {
      console.warn('[TournamentService] eliminatePlayerWhoLeftMatch: parâmetros insuficientes');
      return { eliminated: false, instance: null, shouldAdvance: false };
    }

    console.log(
      `[TournamentService] eliminando jogador instanceId=${payload.instanceId} ` +
      `uid=${payload.uid.slice(0, 8)}... matchId=${payload.matchId}`
    );

    return this.#repo.eliminatePlayerFromActiveMatch(
      payload.instanceId,
      payload.uid,
      payload.matchId
    );
  }
}
