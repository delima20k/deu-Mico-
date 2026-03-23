/**
 * @layer services
 * @group tournament
 * @role Service
 * @depends TournamentService, AuthService, AudioService
 * @exports TournamentGlobalNotifierService
 *
 * Listener global de eventos do campeonato.
 * Funciona em qualquer tela para:
 * - tocar som quando entra novo inscrito;
 * - notificar quando 6/6 for atingido;
 * - redirecionar automaticamente inscritos para a partida ativa.
 */
import { TournamentService } from './TournamentService.js';
import { AuthService } from './AuthService.js';
import { AudioService } from './AudioService.js';

export class TournamentGlobalNotifierService {
  /** @type {TournamentGlobalNotifierService|null} */
  static #instance = null;

  /** @type {TournamentService} */
  #tournamentService;

  /** @type {AuthService} */
  #authService;

  /** @type {AudioService} */
  #audioService;

  /** @type {import('../core/ScreenManager.js').ScreenManager|null} */
  #screenManager = null;

  /** @type {Function|null} */
  #unsubTournament = null;

  /** @type {Function|null} */
  #unsubAuth = null;

  /** @type {string|null} */
  #myUid = null;

  /** @type {Map<string, string>} */
  #lastJoinEventByInstance = new Map();

  /** @type {Map<string, string>} */
  #lastNoticeEventByInstance = new Map();

  /** @type {string|null} */
  #lastForcedMatchId = null;

  /** @type {number|null} */
  #redirectTimer = null;

  /** @type {HTMLElement|null} */
  #toastEl = null;

  /** @type {number|null} */
  #toastTimer = null;

  static getInstance() {
    if (!TournamentGlobalNotifierService.#instance) {
      TournamentGlobalNotifierService.#instance = new TournamentGlobalNotifierService(
        TournamentService.getInstance(),
        AuthService.getInstance(),
        AudioService.getInstance()
      );
    }

    return TournamentGlobalNotifierService.#instance;
  }

  constructor(tournamentService, authService, audioService) {
    this.#tournamentService = tournamentService;
    this.#authService = authService;
    this.#audioService = audioService;
  }

  /**
   * Inicia listeners globais do campeonato.
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   * @returns {Promise<void>}
   */
  async start(screenManager) {
    this.#screenManager = screenManager;
    this.#clearTimer();

    this.#unsubAuth?.();
    this.#unsubAuth = this.#authService.onAuthStateChanged((user) => {
      this.#myUid = user?.uid || null;
    });

    const currentUser = await this.#authService.getCurrentUser().catch(() => null);
    this.#myUid = currentUser?.uid || null;

    this.#unsubTournament?.();
    this.#unsubTournament = await this.#tournamentService.subscribeCurrentTournament((state) => {
      this.#handleTournamentState(state);
    });
  }

  stop() {
    this.#unsubTournament?.();
    this.#unsubAuth?.();
    this.#unsubTournament = null;
    this.#unsubAuth = null;
    this.#clearTimer();
  }

  /**
   * @param {Object|null} state
   * @private
   */
  #handleTournamentState(state) {
    if (!state || !this.#myUid) return;

    const instances = Array.isArray(state.instances) ? state.instances : [];
    const myInstance = instances.find((instance) => {
      const hasMe = !!instance?.enrolledUsers?.[this.#myUid];
      const status = instance?.status || 'waiting';
      return hasMe && status !== 'finished';
    }) || null;

    if (!myInstance) {
      this.#clearTimer();
      return;
    }

    this.#handleJoinNotice(myInstance);
    this.#handleSystemNotice(myInstance);

    const status = myInstance.status || 'waiting';
    if (status === 'countdown') {
      const endsAt = Number(myInstance.countdownEndsAt || 0);
      this.#scheduleRedirect(endsAt);
      return;
    }

    if (status === 'active') {
      this.#clearTimer();
      void this.#forceToTournamentMatch(myInstance);
      return;
    }

    this.#clearTimer();
  }

  /**
   * @param {Object} instance
   * @private
   */
  #handleJoinNotice(instance) {
    const instanceId = instance?.instanceId;
    const eventId = instance?.lastJoinEvent?.eventId;
    const joinUid = instance?.lastJoinEvent?.uid;

    if (!instanceId || !eventId || !joinUid) return;

    const eventKey = `${instanceId}:${eventId}`;
    const previous = this.#lastJoinEventByInstance.get(instanceId);
    this.#lastJoinEventByInstance.set(instanceId, eventKey);

    if (!previous || previous === eventKey) return;
    if (joinUid === this.#myUid) return;

    const name = instance?.lastJoinEvent?.name || 'Jogador';
    const enrolledCount = Number(instance?.enrolledCount || 0);

    this.#audioService.playForce('tournament-opponent-entry');
    this.#showToast(`Novo inscrito no campeonato: ${name} (${enrolledCount}/6)`);
  }

  /**
   * @param {Object} instance
   * @private
   */
  #handleSystemNotice(instance) {
    const instanceId = instance?.instanceId;
    const eventId = instance?.lastSystemNotice?.eventId;
    const type = instance?.lastSystemNotice?.type;

    if (!instanceId || !eventId) return;

    const eventKey = `${instanceId}:${eventId}`;
    const previous = this.#lastNoticeEventByInstance.get(instanceId);
    this.#lastNoticeEventByInstance.set(instanceId, eventKey);

    if (!previous || previous === eventKey) return;

    if (type === 'countdown_started') {
      this.#audioService.playForce('tournament-opponent-entry');
      this.#showToast('6/6 completo: o campeonato vai começar em 1 minuto.');
    }
  }

  /**
   * @param {number} endsAt
   * @private
   */
  #scheduleRedirect(endsAt) {
    if (!endsAt || endsAt <= 0) return;

    const delay = Math.max(0, endsAt - Date.now());
    if (this.#redirectTimer !== null) {
      return;
    }

    this.#redirectTimer = setTimeout(async () => {
      this.#redirectTimer = null;

      try {
        const result = await this.#tournamentService.startIfCountdownElapsed();
        const instance = result?.instance || null;
        if (instance?.status === 'active') {
          await this.#forceToTournamentMatch(instance);
        }
      } catch (error) {
        console.error('[TournamentGlobalNotifier] falha ao processar countdown global:', error);
      }
    }, delay + 250);
  }

  /**
   * @param {Object} instance
   * @returns {Promise<void>}
   * @private
   */
  async #forceToTournamentMatch(instance) {
    if (!this.#screenManager) return;

    const matchId = instance?.currentMatchId || null;
    if (!matchId) return;

    if (this.#lastForcedMatchId === matchId) return;

    const playersMap = instance?.activePlayers && Object.keys(instance.activePlayers).length > 0
      ? instance.activePlayers
      : (instance?.enrolledUsers || {});

    const players = Object.entries(playersMap)
      .map(([uid, value]) => ({
        uid,
        name: value?.name || 'Jogador',
        avatarUrl: value?.avatarUrl || '',
        joinedAt: Number(value?.joinedAt || Date.now()),
      }))
      .sort((a, b) => Number(a.joinedAt || 0) - Number(b.joinedAt || 0));

    if (players.length < 2) return;

    this.#lastForcedMatchId = matchId;
    this.#showToast('Campeonato iniciado: entrando na primeira partida...');

    await this.#screenManager.show('GameTableScreen', {
      matchId,
      roomType: 'tournament',
      players,
      myUid: this.#myUid,
      tournamentId: instance?.tournamentId || null,
      tournamentInstanceId: instance?.instanceId || null,
    });
  }

  /**
   * @param {string} message
   * @private
   */
  #showToast(message) {
    if (!message) return;

    if (!this.#toastEl) {
      this.#toastEl = document.createElement('div');
      this.#toastEl.className = 'global-tournament-toast';
      document.body.append(this.#toastEl);
    }

    this.#toastEl.textContent = message;
    this.#toastEl.classList.add('global-tournament-toast--visible');

    if (this.#toastTimer !== null) {
      clearTimeout(this.#toastTimer);
    }

    this.#toastTimer = setTimeout(() => {
      this.#toastTimer = null;
      this.#toastEl?.classList.remove('global-tournament-toast--visible');
    }, 3400);
  }

  /** @private */
  #clearTimer() {
    if (this.#redirectTimer !== null) {
      clearTimeout(this.#redirectTimer);
      this.#redirectTimer = null;
    }
  }
}
