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

  /** @type {HTMLImageElement|null} */
  #toastAvatarEl = null;

  /** @type {HTMLElement|null} */
  #toastTitleEl = null;

  /** @type {HTMLElement|null} */
  #toastSubtitleEl = null;

  /** @type {number|null} */
  #toastTimer = null;

  /** @type {HTMLButtonElement|null} */
  #toastActionBtnEl = null;

  /** @type {string|null} */
  #pendingConfirmInstanceId = null;

  /** @type {boolean} */
  #confirmPresenceInFlight = false;

  /** @type {number|null} */
  #countdownTimerInterval = null;

  /** @type {number|null} */
  #countdownEndsAt = null;

  /** @type {Function|null} */
  #beforeUnloadListener = null;

  /** @type {Function|null} */
  #visibilityChangeListener = null;

  static #DEFAULT_TOAST_MS = 12000;

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
    this.#clearCountdownTimer();
    this.#removeAppExitListeners();
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
      if (!hasMe || status === 'finished') return false;
      // Para instâncias active: só considera se o usuário for jogador ativo.
      // Isso evita toasts e redirects indevidos para usuários com dados stale.
      if (status === 'active') return !!instance?.activePlayers?.[this.#myUid];
      return true;
    }) || null;

    if (!myInstance) {
      this.#clearTimer();
      return;
    }

    this.#handleJoinNotice(myInstance);
    this.#handleSystemNotice(myInstance);

    const status = myInstance.status || 'waiting';
    const hasConfirmedPresence = !!myInstance?.presenceConfirmations?.[this.#myUid]?.confirmed;
    const matchId = myInstance?.currentMatchId || null;
    if (matchId && this.#tournamentService.wasMatchLeftByUser(matchId)) {
      this.#clearTimer();
      return;
    }

    if (status === 'countdown') {
      const endsAt = Number(myInstance.countdownEndsAt || 0);
      if (!hasConfirmedPresence) {
        this.#showPresenceConfirmToast(myInstance);
        this.#startCountdownTimer(endsAt);
        this.#attachAppExitListeners(myInstance);
      } else {
        this.#hideActionButton();
        this.#clearCountdownTimer();
      }
      this.#scheduleRedirect(endsAt);
      return;
    }

    if (status === 'active') {
      this.#clearTimer();
      const activePlayers = myInstance?.activePlayers || {};
      const hasActivePlayers = Object.keys(activePlayers).length > 0;
      if (hasActivePlayers && !activePlayers[this.#myUid]) {
        // Usuário está inscrito no torneio mas não é jogador ativo nesta partida — evita redirect indevido
        console.log('[TournamentGlobalNotifier] Usuário não é jogador ativo desta partida — redirect ignorado.');
        return;
      }
      void this.#forceToTournamentMatch(myInstance);
      return;
    }

    this.#clearTimer();
    this.#clearCountdownTimer();
    this.#hideActionButton();
    this.#removeAppExitListeners();
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
    const avatarUrl = instance?.lastJoinEvent?.avatarUrl || '';
    const enrolledCount = Number(instance?.enrolledCount || 0);
    const maxParticipants = Number(instance?.maxParticipants || 6);

    const audioDurationMs = this.#audioService.playUntilEnd(
      'tournament-opponent-entry',
      TournamentGlobalNotifierService.#DEFAULT_TOAST_MS
    );
    this.#showJoinToast({
      name,
      avatarUrl,
      enrolledCount,
      maxParticipants,
    }, audioDurationMs);
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
      const activeCount = instance.activePlayers 
        ? Object.keys(instance.activePlayers).length 
        : Number(instance?.enrolledCount || 0);
      const maxCount = Number(instance?.maxParticipants || 6);
      
      const audioDurationMs = this.#audioService.playUntilEnd(
        'tournament-opponent-entry',
        TournamentGlobalNotifierService.#DEFAULT_TOAST_MS
      );
      this.#showToast(`${activeCount}/${maxCount} jogadores: o campeonato vai começar em 1 minuto.`, audioDurationMs);
      return;
    }

    if (type === 'countdown_canceled_unconfirmed') {
      const text = instance?.lastSystemNotice?.text || 'Countdown cancelado por ausência de confirmação. Vagas reabertas.';
      this.#showToast(text);
      this.#clearCountdownTimer();
      this.#removeAppExitListeners();
    }

    if (type === 'player_removed_unconfirmed') {
      const text = instance?.lastSystemNotice?.text || 'Um jogador não confirmou presença e foi removido.';
      this.#showToast(text);
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

    // Verificação 1: partida já foi processada/encerrada no torneio (sem I/O)
    const processedResults = instance?.processedMatchResults || {};
    if (processedResults[matchId]) {
      console.log(`[TournamentGlobalNotifier] Partida ${matchId} já processada — ignorando redirect.`);
      return;
    }

    // Verificação 2: validar partida no Firebase antes de redirecionar
    try {
      const { MatchRepository } = await import('../repositories/MatchRepository.js');
      const match = await MatchRepository.getInstance().getMatchById(matchId);

      if (!match) {
        console.warn(`[TournamentGlobalNotifier] Partida ${matchId} não encontrada no Firebase — ignorando redirect.`);
        this.#lastForcedMatchId = matchId;
        return;
      }

      const matchState = match.getState();
      if (['finished', 'abandoned', 'ended', 'cancelled'].includes(matchState)) {
        console.warn(`[TournamentGlobalNotifier] Partida ${matchId} encerrada (${matchState}) — ignorando redirect.`);
        this.#lastForcedMatchId = matchId;
        return;
      }

      if (this.#myUid && !match.hasPlayer(this.#myUid)) {
        console.warn(`[TournamentGlobalNotifier] Usuário não é jogador da partida ${matchId} — ignorando redirect.`);
        this.#lastForcedMatchId = matchId;
        return;
      }
    } catch (error) {
      const isPermissionDenied = String(error?.message || error).includes('permission_denied');
      if (isPermissionDenied) {
        console.warn(`[TournamentGlobalNotifier] Sem permissão para partida ${matchId} — usuário não é jogador ou partida encerrada. Redirect cancelado.`);
      } else {
        console.error('[TournamentGlobalNotifier] Erro ao validar partida antes de redirecionar:', error);
      }
      this.#lastForcedMatchId = matchId;
      return;
    }

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
  #showToast(message, minVisibleMs = TournamentGlobalNotifierService.#DEFAULT_TOAST_MS) {
    if (!message) return;

    this.#ensureToastEl();
    if (!this.#toastEl || !this.#toastTitleEl || !this.#toastSubtitleEl || !this.#toastAvatarEl) return;

    this.#toastEl.classList.add('global-tournament-toast--text-only');
    this.#hideActionButton();
    this.#toastAvatarEl.style.display = 'none';
    this.#toastTitleEl.textContent = String(message);
    this.#toastSubtitleEl.textContent = '';
    this.#toastEl.classList.add('global-tournament-toast--visible');

    if (this.#toastTimer !== null) {
      clearTimeout(this.#toastTimer);
    }

    const visibleMs = Math.max(
      TournamentGlobalNotifierService.#DEFAULT_TOAST_MS,
      Number(minVisibleMs || 0)
    );

    this.#toastTimer = setTimeout(() => {
      this.#toastTimer = null;
      this.#toastEl?.classList.remove('global-tournament-toast--visible');
    }, visibleMs);
  }

  /**
   * @param {{name: string, avatarUrl?: string, enrolledCount: number, maxParticipants: number}} data
   * @private
   */
  #showJoinToast(data, minVisibleMs = TournamentGlobalNotifierService.#DEFAULT_TOAST_MS) {
    this.#ensureToastEl();
    if (!this.#toastEl || !this.#toastTitleEl || !this.#toastSubtitleEl || !this.#toastAvatarEl) return;

    const name = String(data?.name || 'Jogador');
    const enrolledCount = Number(data?.enrolledCount || 0);
    const maxParticipants = Math.max(2, Number(data?.maxParticipants || 6));
    const avatarUrl = String(data?.avatarUrl || '').trim();

    this.#toastEl.classList.remove('global-tournament-toast--text-only');
    this.#hideActionButton();
    this.#toastAvatarEl.style.display = '';
    this.#toastAvatarEl.src = avatarUrl || 'icons/icon-192.png';
    this.#toastAvatarEl.alt = `Avatar de ${name}`;
    this.#toastAvatarEl.onerror = () => {
      if (this.#toastAvatarEl) {
        this.#toastAvatarEl.onerror = null;
        this.#toastAvatarEl.src = 'icons/icon-192.png';
      }
    };

    this.#toastTitleEl.textContent = `${name} entrou no campeonato`;
    this.#toastSubtitleEl.textContent = `Inscritos: ${enrolledCount}/${maxParticipants}`;
    this.#toastEl.classList.add('global-tournament-toast--visible');

    if (this.#toastTimer !== null) {
      clearTimeout(this.#toastTimer);
    }

    const visibleMs = Math.max(
      TournamentGlobalNotifierService.#DEFAULT_TOAST_MS,
      Number(minVisibleMs || 0)
    );

    this.#toastTimer = setTimeout(() => {
      this.#toastTimer = null;
      this.#toastEl?.classList.remove('global-tournament-toast--visible');
    }, visibleMs);
  }

  /** @private */
  #ensureToastEl() {
    if (this.#toastEl) return;

    const root = document.createElement('div');
    root.className = 'global-tournament-toast';

    const avatar = document.createElement('img');
    avatar.className = 'global-tournament-toast__avatar';
    avatar.alt = 'Avatar do jogador';

    const content = document.createElement('div');
    content.className = 'global-tournament-toast__content';

    const title = document.createElement('p');
    title.className = 'global-tournament-toast__title';

    const subtitle = document.createElement('p');
    subtitle.className = 'global-tournament-toast__subtitle';

    const actionBtn = document.createElement('button');
    actionBtn.className = 'global-tournament-toast__action global-tournament-toast__action--hidden';
    actionBtn.type = 'button';
    actionBtn.textContent = 'Confirmar presença';
    actionBtn.addEventListener('click', () => {
      void this.#onConfirmPresenceClicked();
    });

    content.append(title, subtitle, actionBtn);
    root.append(avatar, content);
    document.body.append(root);

    this.#toastEl = root;
    this.#toastAvatarEl = avatar;
    this.#toastTitleEl = title;
    this.#toastSubtitleEl = subtitle;
    this.#toastActionBtnEl = actionBtn;
  }

  /** @private */
  #hideActionButton() {
    if (!this.#toastActionBtnEl) return;
    this.#toastActionBtnEl.classList.add('global-tournament-toast__action--hidden');
    this.#toastActionBtnEl.disabled = false;
    this.#toastActionBtnEl.textContent = 'Confirmar presença';
    this.#pendingConfirmInstanceId = null;
    this.#confirmPresenceInFlight = false;
  }

  /**
   * @param {Object} instance
   * @private
   */
  #showPresenceConfirmToast(instance) {
    const instanceId = instance?.instanceId;
    if (!instanceId) return;

    this.#ensureToastEl();
    if (!this.#toastEl || !this.#toastTitleEl || !this.#toastSubtitleEl || !this.#toastAvatarEl || !this.#toastActionBtnEl) return;

    const endsAt = Number(instance?.countdownEndsAt || 0);
    const remainSec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));

    this.#pendingConfirmInstanceId = instanceId;
    this.#toastEl.classList.add('global-tournament-toast--text-only');
    this.#toastAvatarEl.style.display = 'none';
    this.#toastTitleEl.textContent = 'Campeonato vai começar em 1 minuto';
    this.#toastSubtitleEl.textContent = `Confirme sua presença para garantir vaga (${remainSec}s)`;
    this.#toastActionBtnEl.classList.remove('global-tournament-toast__action--hidden');
    this.#toastActionBtnEl.disabled = this.#confirmPresenceInFlight;
    this.#toastActionBtnEl.textContent = this.#confirmPresenceInFlight
      ? 'Confirmando...'
      : 'Confirmar presença';

    this.#toastEl.classList.add('global-tournament-toast--visible');

    if (this.#toastTimer !== null) {
      clearTimeout(this.#toastTimer);
    }

    const visibleMs = Math.max(
      TournamentGlobalNotifierService.#DEFAULT_TOAST_MS,
      Math.max(0, endsAt - Date.now())
    );

    this.#toastTimer = setTimeout(() => {
      this.#toastTimer = null;
      this.#toastEl?.classList.remove('global-tournament-toast--visible');
    }, visibleMs);
  }

  /** @private */
  async #onConfirmPresenceClicked() {
    if (this.#confirmPresenceInFlight) return;
    if (!this.#pendingConfirmInstanceId) return;
    if (!this.#toastActionBtnEl || !this.#toastSubtitleEl) return;

    this.#confirmPresenceInFlight = true;
    this.#toastActionBtnEl.disabled = true;
    this.#toastActionBtnEl.textContent = 'Confirmando...';

    try {
      const result = await this.#tournamentService.confirmCurrentTournamentPresence(this.#pendingConfirmInstanceId);
      if (result?.confirmed) {
        const remainMs = this.#countdownEndsAt ? Math.max(0, this.#countdownEndsAt - Date.now()) : 0;
        const remainSec = Math.ceil(remainMs / 1000);
        this.#toastSubtitleEl.textContent = `Presença confirmada. O campeonato vai começar em ${remainSec}s`;
        this.#toastActionBtnEl.textContent = 'Confirmado';
        this.#toastActionBtnEl.disabled = true;
        this.#removeAppExitListeners(); // Remove listeners após confirmação
      } else {
        this.#toastSubtitleEl.textContent = 'Não foi possível confirmar agora. Tente novamente.';
        this.#toastActionBtnEl.disabled = false;
        this.#toastActionBtnEl.textContent = 'Confirmar presença';
      }
    } catch (error) {
      console.error('[TournamentGlobalNotifier] erro ao confirmar presença:', error);
      this.#toastSubtitleEl.textContent = 'Falha ao confirmar presença. Verifique sua conexão e tente novamente.';
      this.#toastActionBtnEl.disabled = false;
      this.#toastActionBtnEl.textContent = 'Confirmar presença';
    } finally {
      this.#confirmPresenceInFlight = false;
    }
  }

  /** @private */
  #clearTimer() {
    if (this.#redirectTimer !== null) {
      clearTimeout(this.#redirectTimer);
      this.#redirectTimer = null;
    }
  }

  /**
   * Inicia timer de contagem regressiva visual.
   * @param {number} endsAt
   * @private
   */
  #startCountdownTimer(endsAt) {
    this.#clearCountdownTimer();
    if (!endsAt || endsAt <= 0) return;

    this.#countdownEndsAt = endsAt;
    this.#updateCountdownDisplay();

    this.#countdownTimerInterval = setInterval(() => {
      this.#updateCountdownDisplay();
      
      const remainMs = this.#countdownEndsAt - Date.now();
      if (remainMs <= 0) {
        this.#clearCountdownTimer();
      }
    }, 1000);
  }

  /**
   * Atualiza o display da contagem regressiva.
   * @private
   */
  #updateCountdownDisplay() {
    if (!this.#toastSubtitleEl || !this.#countdownEndsAt) return;

    const remainMs = Math.max(0, this.#countdownEndsAt - Date.now());
    const remainSec = Math.ceil(remainMs / 1000);

    if (this.#confirmPresenceInFlight) {
      return; // Não atualiza durante confirmação
    }

    const hasConfirmed = this.#toastActionBtnEl?.textContent === 'Confirmado';
    
    // Adiciona classe de urgência quando restar pouco tempo
    if (remainSec <= 15 && !hasConfirmed) {
      this.#toastSubtitleEl.classList.add('global-tournament-toast__subtitle--urgent');
    } else {
      this.#toastSubtitleEl.classList.remove('global-tournament-toast__subtitle--urgent');
    }

    if (hasConfirmed) {
      this.#toastSubtitleEl.textContent = `Presença confirmada. O campeonato vai começar em ${remainSec}s`;
    } else {
      this.#toastSubtitleEl.textContent = `Confirme sua presença para garantir vaga (${remainSec}s)`;
    }
  }

  /**
   * Limpa o timer de contagem regressiva.
   * @private
   */
  #clearCountdownTimer() {
    if (this.#countdownTimerInterval !== null) {
      clearInterval(this.#countdownTimerInterval);
      this.#countdownTimerInterval = null;
    }
    this.#countdownEndsAt = null;
  }

  /**
   * Adiciona listeners para detectar quando o usuário sai do app.
   * @param {Object} instance
   * @private
   */
  #attachAppExitListeners(instance) {
    if (!instance || !this.#myUid) return;

    this.#removeAppExitListeners();

    // beforeunload: quando usuário fecha aba/navegador
    this.#beforeUnloadListener = () => {
      if (!this.#myUid || !instance?.instanceId) return;
      
      // Usa sendBeacon para garantir que a requisição seja enviada mesmo com página fechando
      const hasConfirmed = !!instance?.presenceConfirmations?.[this.#myUid]?.confirmed;
      if (!hasConfirmed) {
        console.log('[TournamentGlobalNotifier] Usuário saindo sem confirmar presença - removendo automaticamente');
        
        // Remove inscrição via API (usando navigator.sendBeacon se disponível)
        void this.#tournamentService.leaveCurrentTournament().catch(err => {
          console.warn('[TournamentGlobalNotifier] Erro ao remover inscrição no beforeunload:', err);
        });
      }
    };

    // visibilitychange: quando usuário minimiza ou troca de aba
    this.#visibilityChangeListener = () => {
      if (document.hidden && this.#myUid && instance?.instanceId) {
        const hasConfirmed = !!instance?.presenceConfirmations?.[this.#myUid]?.confirmed;
        
        // Só remove se ficou oculto por mais de 10 segundos sem confirmar
        if (!hasConfirmed) {
          const checkHiddenTimeout = setTimeout(() => {
            if (document.hidden) {
              console.log('[TournamentGlobalNotifier] App oculto há 10s sem confirmação - removendo');
              void this.#tournamentService.leaveCurrentTournament().catch(err => {
                console.warn('[TournamentGlobalNotifier] Erro ao remover inscrição no visibilitychange:', err);
              });
            }
          }, 10000); // 10 segundos

          // Limpa timeout se voltar antes dos 10s
          const clearOnVisible = () => {
            if (!document.hidden) {
              clearTimeout(checkHiddenTimeout);
              document.removeEventListener('visibilitychange', clearOnVisible);
            }
          };
          document.addEventListener('visibilitychange', clearOnVisible);
        }
      }
    };

    window.addEventListener('beforeunload', this.#beforeUnloadListener);
    document.addEventListener('visibilitychange', this.#visibilityChangeListener);
  }

  /**
   * Remove listeners de saída do app.
   * @private
   */
  #removeAppExitListeners() {
    if (this.#beforeUnloadListener) {
      window.removeEventListener('beforeunload', this.#beforeUnloadListener);
      this.#beforeUnloadListener = null;
    }
    if (this.#visibilityChangeListener) {
      document.removeEventListener('visibilitychange', this.#visibilityChangeListener);
      this.#visibilityChangeListener = null;
    }
  }
}
