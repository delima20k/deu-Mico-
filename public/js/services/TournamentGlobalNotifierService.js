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
    console.log('[TournamentGlobalNotifier] 🚀 INICIANDO serviço...');
    this.#screenManager = screenManager;
    this.#clearTimer();

    this.#unsubAuth?.();
    this.#unsubAuth = this.#authService.onAuthStateChanged((user) => {
      this.#myUid = user?.uid || null;
      console.log(`[TournamentGlobalNotifier] 👤 Auth state changed: uid=${user?.uid?.slice(0,8) || 'null'}`);
    });

    const currentUser = await this.#authService.getCurrentUser().catch(() => null);
    this.#myUid = currentUser?.uid || null;
    console.log(`[TournamentGlobalNotifier] 👤 Current user: uid=${this.#myUid?.slice(0,8) || 'null'}`);

    this.#unsubTournament?.();
    console.log('[TournamentGlobalNotifier] 📡 Subscribing to tournament state...');
    this.#unsubTournament = await this.#tournamentService.subscribeCurrentTournament((state) => {
      console.log('[TournamentGlobalNotifier] 📥 State update received');
      this.#handleTournamentState(state);
    });
    console.log('[TournamentGlobalNotifier] ✅ Serviço iniciado com sucesso');
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
    console.log('[TournamentGlobalNotifier] 🔄 #handleTournamentState called');
    
    if (!state || !this.#myUid) {
      console.log(`[TournamentGlobalNotifier] ⚠️ Sem state ou myUid - state=${!!state} myUid=${!!this.#myUid}`);
      return;
    }

    const instances = Array.isArray(state.instances) ? state.instances : [];
    console.log(`[TournamentGlobalNotifier] 📊 Processando ${instances.length} instâncias para uid=${this.#myUid.slice(0,8)}`);
    
    const myInstance = instances.find((instance) => {
      const hasMe = !!instance?.enrolledUsers?.[this.#myUid];
      const status = instance?.status || 'waiting';
      
      console.log(`[TournamentGlobalNotifier]   🔍 Checking ${instance?.instanceId} - status=${status} hasMe=${hasMe}`);
      
      if (!hasMe) {
        console.log(`[TournamentGlobalNotifier]     ❌ Não estou inscrito nesta instância`);
        return false;
      }
      
      if (status === 'finished') {
        console.log(`[TournamentGlobalNotifier]     ⛔ Instância finished - ignorando`);
        return false;
      }
      
      // Para instâncias active: só considera se o usuário for jogador ativo.
      // Isso evita toasts e redirects indevidos para usuários com dados stale.
      if (status === 'active') {
        const isActive = !!instance?.activePlayers?.[this.#myUid];
        console.log(`[TournamentGlobalNotifier]     🎮 Active - isActivePlayer=${isActive}`);
        if (!isActive) {
          console.log(`[TournamentGlobalNotifier]     ⚠️ Em enrolledUsers mas não em activePlayers - ignorando`);
        }
        return isActive;
      }
      
      console.log(`[TournamentGlobalNotifier]     ✅ Instância válida!`);
      return true;
    }) || null;

    if (myInstance) {
      console.log(`[TournamentGlobalNotifier] 🎯 myInstance ENCONTRADO:`, {
        instanceId: myInstance.instanceId,
        status: myInstance.status,
        enrolledCount: myInstance.enrolledCount,
        confirmationRequired: myInstance.confirmationRequired,
        hasLastSystemNotice: !!myInstance.lastSystemNotice,
        systemNoticeType: myInstance.lastSystemNotice?.type,
      });
    } else {
      console.log('[TournamentGlobalNotifier] ❌ NENHUMA instância válida encontrada');
      this.#clearTimer();
      return;
    }

    console.log('[TournamentGlobalNotifier] 📢 Chamando #handleJoinNotice...');
    this.#handleJoinNotice(myInstance);
    
    console.log('[TournamentGlobalNotifier] 📢 Chamando #handleSystemNotice...');
    this.#handleSystemNotice(myInstance);

    const status = myInstance.status || 'waiting';
    const hasConfirmedPresence = !!myInstance?.presenceConfirmations?.[this.#myUid]?.confirmed;
    const matchId = myInstance?.currentMatchId || null;
    if (matchId && this.#tournamentService.wasMatchLeftByUser(matchId)) {
      console.log(`[TournamentGlobalNotifier] Usuário saiu da match ${matchId} - ignorando`);
      this.#clearTimer();
      return;
    }

    if (status === 'countdown') {
      const endsAt = Number(myInstance.countdownEndsAt || 0);
      const remainSec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      
      console.log(`[TournamentGlobalNotifier] ⏰ STATUS COUNTDOWN detectado!`, {
        uid: this.#myUid?.slice(0,8),
        instanceId: myInstance.instanceId,
        hasConfirmedPresence,
        endsAt: new Date(endsAt).toISOString(),
        remainingSec: remainSec,
        confirmationRequired: myInstance.confirmationRequired,
      });
      
      if (!hasConfirmedPresence) {
        console.log(`[TournamentGlobalNotifier] 🔔 Usuário NÃO confirmou - MOSTRANDO POPUP de confirmação...`);
        this.#showPresenceConfirmToast(myInstance);
        this.#startCountdownTimer(endsAt);
        this.#attachAppExitListeners(myInstance);
      } else {
        console.log('[TournamentGlobalNotifier] ✅ Presença JÁ CONFIRMADA - ocultando botão');
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
    console.log('[TournamentGlobalNotifier] 🔔 #handleSystemNotice EXECUTANDO');
    
    const instanceId = instance?.instanceId;
    const eventId = instance?.lastSystemNotice?.eventId;
    const type = instance?.lastSystemNotice?.type;

    console.log(`[TournamentGlobalNotifier]   📝 instanceId=${instanceId} eventId=${eventId} type=${type}`);

    if (!instanceId || !eventId) {
      console.log(`[TournamentGlobalNotifier]   ⚠️ Sem instanceId ou eventId - abortando`);
      return;
    }

    const eventKey = `${instanceId}:${eventId}`;
    const previous = this.#lastNoticeEventByInstance.get(instanceId);
    
    console.log(`[TournamentGlobalNotifier]   🔑 eventKey="${eventKey}" previous="${previous || 'null'}"`);
    
    this.#lastNoticeEventByInstance.set(instanceId, eventKey);

    if (!previous) {
      console.log(`[TournamentGlobalNotifier]   🆕 PRIMEIRO evento para esta instância - processando!`);
    } else if (previous === eventKey) {
      console.log(`[TournamentGlobalNotifier]   ♻️ Evento JÁ PROCESSADO - ignorando`);
      return;
    } else {
      console.log(`[TournamentGlobalNotifier]   🆕 NOVO evento (diferente do anterior) - processando!`);
    }

    console.log(`[TournamentGlobalNotifier] 🎯 PROCESSANDO System Notice: type=${type}`);

    if (type === 'countdown_started') {
      console.log(`[TournamentGlobalNotifier] ⏰ COUNTDOWN STARTED detectado!`);
      const activeCount = instance.activePlayers 
        ? Object.keys(instance.activePlayers).length 
        : Number(instance?.enrolledCount || 0);
      const maxCount = Number(instance?.maxParticipants || 6);
      
      console.log(`[TournamentGlobalNotifier] 🎉 MOSTRANDO TOAST: Countdown iniciado ${activeCount}/${maxCount} jogadores!`);
      
      const audioDurationMs = this.#audioService.playUntilEnd(
        'tournament-opponent-entry',
        TournamentGlobalNotifierService.#DEFAULT_TOAST_MS
      );
      
      console.log(`[TournamentGlobalNotifier] 🔊 Som tocando por ${audioDurationMs}ms`);
      
      this.#showToast(`${activeCount}/${maxCount} jogadores: o campeonato vai começar em 1 minuto.`, audioDurationMs);
      
      console.log(`[TournamentGlobalNotifier] ✅ Toast exibido com sucesso!`);
      return;
    }

    if (type === 'countdown_canceled_unconfirmed') {
      const text = instance?.lastSystemNotice?.text || 'Countdown cancelado por ausência de confirmação. Vagas reabertas.';
      console.log(`[TournamentGlobalNotifier] Countdown cancelado: ${text}`);
      this.#showToast(text);
      this.#clearCountdownTimer();
      this.#removeAppExitListeners();
    }

    if (type === 'player_removed_unconfirmed') {
      const text = instance?.lastSystemNotice?.text || 'Um jogador não confirmou presença e foi removido.';
      console.log(`[TournamentGlobalNotifier] Player removed: ${text}`);
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
    if (this.#toastEl) {
      console.log('[TournamentGlobalNotifier] Toast element já existe, reutilizando');
      return;
    }

    console.log('[TournamentGlobalNotifier] Criando elementos do toast pela primeira vez');

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
    
    // CRÍTICO: Adiciona listener com bind explícito para garantir contexto
    const clickHandler = () => {
      console.log('[TournamentGlobalNotifier] 🖱️ Click detectado no botão de confirmação!');
      void this.#onConfirmPresenceClicked();
    };
    actionBtn.addEventListener('click', clickHandler, { passive: false });
    
    console.log('[TournamentGlobalNotifier] ✅ Listener de click adicionado ao botão');

    content.append(title, subtitle, actionBtn);
    root.append(avatar, content);
    document.body.append(root);

    this.#toastEl = root;
    this.#toastAvatarEl = avatar;
    this.#toastTitleEl = title;
    this.#toastSubtitleEl = subtitle;
    this.#toastActionBtnEl = actionBtn;
    
    console.log('[TournamentGlobalNotifier] Toast DOM criado e anexado ao body');
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

  /** @private */
  #hideToast() {
    if (this.#toastTimer !== null) {
      clearTimeout(this.#toastTimer);
      this.#toastTimer = null;
    }
    this.#toastEl?.classList.remove('global-tournament-toast--visible');
  }

  /** @private */
  #showPresenceConfirmToast(instance) {
    console.log('[TournamentGlobalNotifier] 🎯 #showPresenceConfirmToast EXECUTANDO...');
    
    const instanceId = instance?.instanceId;
    if (!instanceId) {
      console.error('[TournamentGlobalNotifier] ❌ #showPresenceConfirmToast chamado sem instanceId!');
      return;
    }

    console.log(`[TournamentGlobalNotifier] 📋 instanceId=${instanceId}`);
    
    this.#ensureToastEl();
    
    if (!this.#toastEl || !this.#toastTitleEl || !this.#toastSubtitleEl || !this.#toastAvatarEl || !this.#toastActionBtnEl) {
      console.error('[TournamentGlobalNotifier] ❌ Elementos do toast NÃO foram criados!', {
        toastEl: !!this.#toastEl,
        titleEl: !!this.#toastTitleEl,
        subtitleEl: !!this.#toastSubtitleEl,
        avatarEl: !!this.#toastAvatarEl,
        actionBtnEl: !!this.#toastActionBtnEl,
      });
      return;
    }

    console.log('[TournamentGlobalNotifier] ✅ Todos os elementos do toast existem');

    const endsAt = Number(instance?.countdownEndsAt || 0);
    const remainSec = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));

    console.log(`[TournamentGlobalNotifier] ⏰ Tempo restante: ${remainSec}s (endsAt=${new Date(endsAt).toISOString()})`);
    console.log(`[TournamentGlobalNotifier] 🔔 Mostrando toast de confirmação para ${this.#myUid?.slice(0,8)} (${remainSec}s restantes)`);

    this.#pendingConfirmInstanceId = instanceId;
    
    console.log('[TournamentGlobalNotifier] 🎨 Configurando elementos do toast...');
    
    this.#toastEl.classList.add('global-tournament-toast--text-only');
    this.#toastAvatarEl.style.display = 'none';
    this.#toastTitleEl.textContent = 'Campeonato vai começar em 1 minuto';
    this.#toastSubtitleEl.textContent = `Confirme sua presença para garantir vaga (${remainSec}s)`;
    this.#toastActionBtnEl.classList.remove('global-tournament-toast__action--hidden');
    this.#toastActionBtnEl.disabled = this.#confirmPresenceInFlight;
    this.#toastActionBtnEl.textContent = this.#confirmPresenceInFlight
      ? 'Confirmando...'
      : 'Confirmar presença';

    console.log('[TournamentGlobalNotifier] 🎨 Elementos configurados:', {
      title: this.#toastTitleEl.textContent,
      subtitle: this.#toastSubtitleEl.textContent,
      buttonVisible: !this.#toastActionBtnEl.classList.contains('global-tournament-toast__action--hidden'),
      buttonDisabled: this.#toastActionBtnEl.disabled,
    });

    console.log('[TournamentGlobalNotifier] 👁️ TORNANDO TOAST VISÍVEL...');
    this.#toastEl.classList.add('global-tournament-toast--visible');
    
    console.log('[TournamentGlobalNotifier] ✅ Toast agora está com classe "visible":', {
      hasVisibleClass: this.#toastEl.classList.contains('global-tournament-toast--visible'),
      allClasses: Array.from(this.#toastEl.classList),
    });

    if (this.#toastTimer !== null) {
      console.log('[TournamentGlobalNotifier] ⏰ Limpando timer anterior');
      clearTimeout(this.#toastTimer);
    }

    const visibleMs = Math.max(
      TournamentGlobalNotifierService.#DEFAULT_TOAST_MS,
      Math.max(0, endsAt - Date.now())
    );

    console.log(`[TournamentGlobalNotifier] ⏰ Toast ficará visível por ${visibleMs}ms`);

    this.#toastTimer = setTimeout(() => {
      console.log('[TournamentGlobalNotifier] ⏰ Timer expirou - ocultando toast');
      this.#toastTimer = null;
      this.#toastEl?.classList.remove('global-tournament-toast--visible');
    }, visibleMs);
    
    console.log('[TournamentGlobalNotifier] 🎉 #showPresenceConfirmToast CONCLUÍDO COM SUCESSO!');
  }

  /** @private */
  async #onConfirmPresenceClicked() {
    console.log('[TournamentGlobalNotifier] 🖱️ Botão de confirmação clicado');
    
    if (this.#confirmPresenceInFlight) {
      console.log('[TournamentGlobalNotifier] Confirmação já em andamento, ignorando');
      return;
    }
    if (!this.#pendingConfirmInstanceId) {
      console.warn('[TournamentGlobalNotifier] Sem instanceId pendente para confirmar');
      return;
    }
    if (!this.#toastActionBtnEl || !this.#toastSubtitleEl) {
      console.error('[TournamentGlobalNotifier] Elementos do toast não disponíveis');
      return;
    }

    console.log(`[TournamentGlobalNotifier] Confirmando presença para instanceId=${this.#pendingConfirmInstanceId}`);

    this.#confirmPresenceInFlight = true;
    this.#toastActionBtnEl.disabled = true;
    this.#toastActionBtnEl.textContent = 'Confirmando...';

    try {
      const result = await this.#tournamentService.confirmCurrentTournamentPresence(this.#pendingConfirmInstanceId);
      console.log('[TournamentGlobalNotifier] Resultado da confirmação:', result);
      
      if (result?.confirmed) {
        this.#toastSubtitleEl.textContent = 'Presença confirmada! Redirecionando...';
        this.#toastActionBtnEl.textContent = 'Confirmado ✓';
        this.#toastActionBtnEl.disabled = true;
        this.#removeAppExitListeners(); // Remove listeners após confirmação bem-sucedida
        console.log('[TournamentGlobalNotifier] ✅ Presença confirmada com sucesso');
        
        // REDIRECIONA IMEDIATAMENTE para tela de espera do torneio
        console.log('[TournamentGlobalNotifier] 🚀 Redirecionando para TournamentScreen...');
        setTimeout(() => {
          this.#hideToast();
          if (this.#screenManager) {
            this.#screenManager.navigateTo('tournament');
          } else {
            window.location.hash = '#tournament';
          }
        }, 800); // Delay mínimo para usuário ver confirmação
      } else {
        console.warn('[TournamentGlobalNotifier] Confirmação retornou false');
        this.#toastSubtitleEl.textContent = 'Não foi possível confirmar agora. Tente novamente.';
        this.#toastActionBtnEl.disabled = false;
        this.#toastActionBtnEl.textContent = 'Confirmar presença';
      }
    } catch (error) {
      console.error('[TournamentGlobalNotifier] ❌ Erro ao confirmar presença:', error);
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
   * Adiciona listeners para detectar quando o usuário realmente abandona o app.
   * NOTA: Lógica ajustada para PWAs mobile - não remove por minimização temporária.
   * @param {Object} instance
   * @private
   */
  #attachAppExitListeners(instance) {
    if (!instance || !this.#myUid) return;

    this.#removeAppExitListeners();

    let hiddenTimer = null;

    // beforeunload: quando usuário fecha aba/navegador
    this.#beforeUnloadListener = () => {
      if (!this.#myUid || !instance?.instanceId) return;
      
      const hasConfirmed = !!instance?.presenceConfirmations?.[this.#myUid]?.confirmed;
      if (!hasConfirmed) {
        console.log('[TournamentGlobalNotifier] Usuário fechando navegador sem confirmar - removendo');
        
        // Remove inscrição (beforeunload é síncrono, tentativa best-effort)
        void this.#tournamentService.leaveCurrentTournament().catch(err => {
          console.warn('[TournamentGlobalNotifier] Erro ao remover no beforeunload:', err);
        });
      }
    };

    // visibilitychange: quando usuário minimiza ou troca de aba
    // IMPORTANTE: PWAs mobile frequentemente mudam para segundo plano.
    // Só removemos se ficar oculto por tempo prolongado (45s+) sem confirmar.
    this.#visibilityChangeListener = () => {
      if (document.hidden) {
        // App foi para segundo plano
        const hasConfirmed = !!instance?.presenceConfirmations?.[this.#myUid]?.confirmed;
        
        if (!hasConfirmed && this.#myUid && instance?.instanceId) {
          console.log('[TournamentGlobalNotifier] App minimizado sem confirmação - aguardando 45s...');
          
          // Dá tempo generoso (45s) para usuário voltar - comum em PWAs mobile
          hiddenTimer = setTimeout(() => {
            if (document.hidden && !instance?.presenceConfirmations?.[this.#myUid]?.confirmed) {
              console.log('[TournamentGlobalNotifier] App oculto há 45s sem confirmação - removendo');
              void this.#tournamentService.leaveCurrentTournament().catch(err => {
                console.warn('[TournamentGlobalNotifier] Erro ao remover no visibilitychange:', err);
              });
            } else {
              console.log('[TournamentGlobalNotifier] Usuário voltou ou confirmou - cancelando remoção');
            }
          }, 45000); // 45 segundos - tempo mais realista para PWAs
        }
      } else {
        // App voltou para primeiro plano - cancela timer
        if (hiddenTimer) {
          console.log('[TournamentGlobalNotifier] App voltou - cancelando timer de remoção');
          clearTimeout(hiddenTimer);
          hiddenTimer = null;
        }
      }
    };

    window.addEventListener('beforeunload', this.#beforeUnloadListener);
    document.addEventListener('visibilitychange', this.#visibilityChangeListener);
    
    console.log('[TournamentGlobalNotifier] Listeners de saída ativados (45s grace period)');
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
    console.log('[TournamentGlobalNotifier] Listeners de saída removidos');
  }
}
