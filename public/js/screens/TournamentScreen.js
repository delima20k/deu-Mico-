/**
 * @layer screens
 * @group game
 * @role Screen
 * @depends Screen, HeaderBar, TournamentCard, TournamentService
 * @exports TournamentScreen
 *
 * Tela de campeonato realtime.
 * Exibe: torneio atual, botão participar, aviso de faltantes,
 * countdown de inicio e ranking Top 50 em tempo real.
 */
import { Screen } from '../core/Screen.js';
import { HeaderBar } from '../components/HeaderBar.js';
import { TournamentCard } from '../components/TournamentCard.js';
import { TournamentService } from '../services/TournamentService.js';
import { AuthService } from '../services/AuthService.js';
import { AudioService } from '../services/AudioService.js';
import { Dom } from '../utils/Dom.js';

export class TournamentScreen extends Screen {
  /** @type {import('../core/ScreenManager.js').ScreenManager} */
  #screenManager;

  /** @type {HeaderBar} */
  #headerBar;

  /** @type {TournamentCard} */
  #tournamentCard;

  /** @type {Object|null} */
  #currentTournament = null;

  /** @type {Object|null} */
  #currentRealtimeState = null;

  /** @type {Array} Leaderboard top 50 */
  #leaderboard = [];

  /** @type {TournamentService} */
  #tournamentService;

  /** @type {string|null} */
  #myUid = null;

  /** @type {Function|null} */
  #unsubTournament = null;

  /** @type {Function|null} */
  #unsubLeaderboard = null;

  /** @type {HTMLElement|null} */
  #statusBannerEl = null;

  /** @type {HTMLElement|null} */
  #countdownEl = null;

  /** @type {HTMLElement|null} */
  #leaderboardTbodyEl = null;

  /** @type {ReturnType<typeof setInterval>|null} */
  #countdownInterval = null;

  /** @type {boolean} */
  #isStartingTournament = false;

  /** @type {boolean} */
  #isJoiningTournament = false;

  /** @type {number|null} */
  #lastEnrolledCount = null;

  /** @type {string|null} */
  #lastJoinEventId = null;

  /** @type {string|null} */
  #lastSystemNoticeId = null;

  /** @type {string|null} */
  #lastObservedInstanceId = null;

  /** @type {string|null} */
  #navigatedMatchId = null;

  /** @type {number} */
  #justJoinedAt = 0;

  /** @type {number} */
  #entryNoticeVisibleUntil = 0;

  /** @type {ReturnType<typeof setTimeout>|null} */
  #entryNoticeTimer = null;

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    super('TournamentScreen');
    this.#screenManager = screenManager;
    this.#tournamentService = TournamentService.getInstance();
  }

  /**
   * Cria o template da tela.
   * @returns {HTMLElement}
   */
  _buildTemplate() {
    const wrapper = Dom.create('div', { classes: 'tournament-screen' });
    return wrapper;
  }

  /**
   * Renderiza a tela de torneio.
   */
  async onEnter() {
    const container = this.getElement();
    container.innerHTML = '';
    this.#myUid = (await AuthService.getInstance().getCurrentUser())?.uid || null;

    // Header
    this.#headerBar = new HeaderBar();
    const headerEl = this.#headerBar.create();
    container.append(headerEl);

    // Botão para sair da tela de campeonato
    const btnBack = Dom.create('button', {
      classes: 'tournament-screen__back-btn',
      text: '← Sair',
      attrs: { type: 'button' },
    });
    btnBack.addEventListener('click', () => {
      this.#screenManager.show('MenuScreen');
    });

    // Título
    const title = Dom.create('h1', {
      classes: 'tournament-screen__title',
      text: 'Campeonato',
    });

    // Seção do torneio atual
    const tournamentSection = Dom.create('section', {
      classes: 'tournament-screen__tournament-section',
    });

    const sectionTitle = Dom.create('h2', {
      classes: 'tournament-screen__section-title',
      text: 'Torneio Atual',
    });

    this.#tournamentCard = new TournamentCard({
      tournament: {
        id: 'loading',
        name: 'Carregando campeonato...',
        startDate: new Date().toISOString(),
        prize: 'Premiacao em definicao',
        enrolledCount: 0,
      },
      onJoin: () => this.#onJoinTournament(),
    });

    const tournamentCardEl = this.#tournamentCard.create();

    this.#statusBannerEl = Dom.create('div', {
      classes: 'tournament-screen__status-banner',
      text: 'Aguardando estado do campeonato...',
    });

    this.#countdownEl = Dom.create('div', {
      classes: 'tournament-screen__countdown tournament-screen__countdown--hidden',
      text: 'Inicio em 60s',
    });

    tournamentSection.append(sectionTitle, tournamentCardEl, this.#statusBannerEl, this.#countdownEl);

    // Seção leaderboard
    const leaderboardSection = Dom.create('section', {
      classes: 'tournament-screen__leaderboard-section',
    });

    const leaderboardTitle = Dom.create('h2', {
      classes: 'tournament-screen__section-title',
      text: 'Ranking Top 50',
    });

    const leaderboardTable = this.#buildLeaderboardTable();
    leaderboardSection.append(leaderboardTitle, leaderboardTable);

    // Container principal
    const mainContainer = Dom.create('main', { classes: 'tournament-screen__main' });
    mainContainer.append(btnBack, title, tournamentSection, leaderboardSection);

    container.append(mainContainer);

    await this.#startRealtimeBindings();
  }

  /**
   * Limpa ao sair da tela.
   */
  onExit() {
    this.#unsubTournament?.();
    this.#unsubTournament = null;

    this.#unsubLeaderboard?.();
    this.#unsubLeaderboard = null;

    this.#clearCountdownTicker();
    this.#clearEntryNoticeTimer();
    this.#entryNoticeVisibleUntil = 0;
    this.#lastEnrolledCount = null;
    this.#lastJoinEventId = null;
    this.#lastSystemNoticeId = null;
    this.#lastObservedInstanceId = null;
    this.#navigatedMatchId = null;
    this.#justJoinedAt = 0;
  }

  /**
   * Inicializa listeners realtime do torneio e ranking.
   * @private
   */
  async #startRealtimeBindings() {
    this.#unsubTournament?.();
    this.#unsubLeaderboard?.();

    this.#unsubTournament = await this.#tournamentService.subscribeCurrentTournament((state) => {
      this.#myUid = state?.myUid || null;
      this.#currentRealtimeState = state;
      const selected = this.#resolveObservedInstance(state);
      const nextEnrolledCount = Number(selected?.enrolledCount || 0);
      const prevEnrolledCount = this.#lastEnrolledCount;

      const isJoinedInSelected = !!(this.#myUid && selected?.enrolledUsers?.[this.#myUid]);
      const selectedInstanceId = selected?.instanceId || null;

      if (selectedInstanceId && selectedInstanceId !== this.#lastObservedInstanceId) {
        this.#lastObservedInstanceId = selectedInstanceId;
        this.#lastJoinEventId = selected?.lastJoinEvent?.eventId
          ? `${selectedInstanceId}:${selected.lastJoinEvent.eventId}`
          : null;
        this.#lastSystemNoticeId = selected?.lastSystemNotice?.eventId
          ? `${selectedInstanceId}:${selected.lastSystemNotice.eventId}`
          : null;
      }

      if (selected && isJoinedInSelected) {
        const joinEventId = selected?.lastJoinEvent?.eventId || null;
        const joinUid = selected?.lastJoinEvent?.uid || null;
        const joinEventKey = joinEventId ? `${selectedInstanceId}:${joinEventId}` : null;

        if (joinEventKey && joinEventKey !== this.#lastJoinEventId && joinUid && joinUid !== this.#myUid) {
          this.#showEntryNotice(selected?.lastJoinEvent?.name || 'Jogador', nextEnrolledCount);
          AudioService.getInstance().playForce('tournament-opponent-entry');
        }
        if (joinEventKey) {
          this.#lastJoinEventId = joinEventKey;
        }
      } else {
        this.#lastJoinEventId = selected?.lastJoinEvent?.eventId
          ? `${selectedInstanceId}:${selected.lastJoinEvent.eventId}`
          : this.#lastJoinEventId;
      }

      const noticeEventId = selected?.lastSystemNotice?.eventId || null;
      const noticeEventKey = noticeEventId ? `${selectedInstanceId}:${noticeEventId}` : null;

      if (noticeEventKey && noticeEventKey !== this.#lastSystemNoticeId) {
        this.#lastSystemNoticeId = noticeEventKey;

        if (isJoinedInSelected && selected?.lastSystemNotice?.type === 'countdown_started') {
          this.#showSystemNotice('6/6 completo. Combate comeca em 1 minuto.');
        }
      }

      this.#currentTournament = selected;
      this.#lastEnrolledCount = selected ? nextEnrolledCount : null;
      this.#renderTournamentState();
      void this.#maybeNavigateToCurrentMatch();
    });

    this.#unsubLeaderboard = await this.#tournamentService.subscribeLeaderboardTop50((rows) => {
      this.#leaderboard = rows;
      this.#renderLeaderboardRows();
    });
  }

  /**
   * Constrói a tabela de leaderboard.
   * @private
   * @returns {HTMLElement}
   */
  #buildLeaderboardTable() {
    const table = Dom.create('table', { classes: 'tournament-screen__leaderboard-table' });

    // Header
    const thead = Dom.create('thead');
    const headerRow = Dom.create('tr');
    ['Posição', 'Nome', 'Pontos', 'Pares'].forEach(col => {
      const th = Dom.create('th', { text: col });
      headerRow.append(th);
    });
    thead.append(headerRow);

    // Body
    const tbody = Dom.create('tbody');
    this.#leaderboardTbodyEl = tbody;

    table.append(thead, tbody);
    return table;
  }

  /**
   * Renderiza status do torneio atual.
   * @private
   */
  #renderTournamentState() {
    if (!this.#tournamentCard) return;

    const state = this.#currentTournament;
    if (!state) {
      this.#statusBannerEl.textContent = 'Aguardando abertura de nova rodada de campeonato...';
      return;
    }

    const enrolledCount = Number(state.enrolledCount || 0);
    const maxParticipants = Number(state.maxParticipants || 0);
    const missing = Math.max(0, maxParticipants - enrolledCount);
    const status = state.status || 'waiting';
    const isJoined = !!(this.#myUid && state.enrolledUsers?.[this.#myUid]);

    this.#tournamentCard.update({
      ...state,
      name: `Rodada ${String(state.instanceId || '').slice(-6)}`,
    });

    const joinBtn = this.#tournamentCard
      .getElement()
      ?.querySelector('.tournament-card__join-btn');

    if (joinBtn) {
      joinBtn.disabled = this.#isJoiningTournament || isJoined || status === 'active';
      joinBtn.textContent = this.#isJoiningTournament
        ? 'INSCREVENDO...'
        : isJoined
        ? 'INSCRITO'
        : status === 'active'
          ? 'EM ANDAMENTO'
          : 'PARTICIPAR';
    }

    if (status === 'waiting') {
      if (Date.now() < this.#entryNoticeVisibleUntil) {
        this.#countdownEl.classList.add('tournament-screen__countdown--hidden');
        this.#clearCountdownTicker();
        return;
      }

      this.#statusBannerEl.textContent = missing > 0
        ? `Rodada aberta (${enrolledCount}/${maxParticipants}). Faltam ${missing} jogador${missing > 1 ? 'es' : ''}.`
        : 'Vagas completas. Countdown sera iniciado automaticamente.';
      this.#countdownEl.classList.add('tournament-screen__countdown--hidden');
      this.#clearCountdownTicker();
      return;
    }

    if (status === 'countdown') {
      this.#statusBannerEl.textContent = '6/6 completo. Combate comeca em 1 minuto.';
      this.#countdownEl.classList.remove('tournament-screen__countdown--hidden');
      this.#startCountdownTicker(Number(state.countdownEndsAt || 0));
      return;
    }

    if (status === 'active') {
      this.#statusBannerEl.textContent = 'Campeonato em andamento. Prepare-se para a partida.';
      this.#countdownEl.classList.add('tournament-screen__countdown--hidden');
      this.#clearCountdownTicker();
      return;
    }

    if (status === 'finished') {
      const championUid = state.championUid || null;
      const championName = championUid
        ? (state.enrolledUsers?.[championUid]?.name || 'Jogador')
        : 'Indefinido';
      this.#statusBannerEl.textContent = `Rodada finalizada. Campeão: ${championName}.`;
      this.#countdownEl.classList.add('tournament-screen__countdown--hidden');
      this.#clearCountdownTicker();
    }
  }

  /**
   * Atualiza tabela Top 50.
   * @private
   */
  #renderLeaderboardRows() {
    if (!this.#leaderboardTbodyEl) return;

    this.#leaderboardTbodyEl.innerHTML = '';

    if (!this.#leaderboard.length) {
      const emptyRow = Dom.create('tr');
      const emptyCell = Dom.create('td', {
        text: 'Sem pontuacoes ainda. Os pares formados aparecerao aqui em tempo real.',
        attrs: { colspan: '4' },
      });
      emptyRow.append(emptyCell);
      this.#leaderboardTbodyEl.append(emptyRow);
      return;
    }

    this.#leaderboard.forEach((entry) => {
      const tr = Dom.create('tr');
      const rankTd = Dom.create('td', { text: `${entry.rank}º` });
      const nameTd = Dom.create('td', { text: entry.name || 'Jogador' });
      const pointsTd = Dom.create('td', { text: `${entry.points}` });
      const winsTd = Dom.create('td', { text: `${entry.pairs || 0}` });
      tr.append(rankTd, nameTd, pointsTd, winsTd);
      this.#leaderboardTbodyEl.append(tr);
    });
  }

  /**
   * Inicia ticker local de countdown com base em countdownEndsAt do Firebase.
   * @param {number} endsAt
   * @private
   */
  #startCountdownTicker(endsAt) {
    if (!endsAt || endsAt <= 0) return;

    this.#clearCountdownTicker();

    const tick = () => {
      const remainingMs = Math.max(0, endsAt - Date.now());
      const remainingSec = Math.ceil(remainingMs / 1000);
      this.#countdownEl.textContent = `Inicio em ${this.#formatCountdown(remainingSec)}`;

      if (remainingMs <= 0) {
        this.#clearCountdownTicker();
        void this.#tryStartTournament();
      }
    };

    tick();
    this.#countdownInterval = setInterval(tick, 500);
  }

  /**
   * @private
   */
  #clearCountdownTicker() {
    if (this.#countdownInterval !== null) {
      clearInterval(this.#countdownInterval);
      this.#countdownInterval = null;
    }
  }

  /** @private */
  #clearEntryNoticeTimer() {
    if (this.#entryNoticeTimer !== null) {
      clearTimeout(this.#entryNoticeTimer);
      this.#entryNoticeTimer = null;
    }
  }

  /** @private */
  #showEntryNotice(playerName, totalCount) {
    if (!this.#statusBannerEl) return;

    const safeTotal = Math.max(0, Number(totalCount || 0));

    this.#statusBannerEl.textContent = `Entrou mais um oponente: ${playerName}. Total agora: ${safeTotal}.`;
    this.#entryNoticeVisibleUntil = Date.now() + 3200;

    this.#clearEntryNoticeTimer();
    this.#entryNoticeTimer = setTimeout(() => {
      this.#entryNoticeVisibleUntil = 0;
      this.#renderTournamentState();
    }, 3200);
  }

  /** @private */
  #showSystemNotice(text, durationMs = 3000) {
    if (!this.#statusBannerEl || !text) return;

    this.#statusBannerEl.textContent = String(text);
    this.#entryNoticeVisibleUntil = Date.now() + Math.max(1200, Number(durationMs || 0));

    this.#clearEntryNoticeTimer();
    this.#entryNoticeTimer = setTimeout(() => {
      this.#entryNoticeVisibleUntil = 0;
      this.#renderTournamentState();
    }, Math.max(1200, Number(durationMs || 0)));
  }

  /**
   * Resolve a instância que deve ser observada na tela.
   * Prioriza sempre a instância em que o usuário atual está inscrito.
   * @param {Object|null} state
   * @returns {Object|null}
   * @private
   */
  #resolveObservedInstance(state) {
    const instances = Array.isArray(state?.instances) ? state.instances : [];

    if (this.#myUid) {
      const myInstance = instances.find((instance) => {
        const hasMe = !!instance?.enrolledUsers?.[this.#myUid];
        const status = instance?.status || 'waiting';
        return hasMe && status !== 'finished';
      }) || null;

      if (myInstance) {
        return myInstance;
      }
    }

    return state?.selectedInstance || state?.joinableInstance || instances[0] || null;
  }

  /**
   * @param {number} totalSeconds
   * @returns {string}
   * @private
   */
  #formatCountdown(totalSeconds) {
    const safe = Math.max(0, Number(totalSeconds || 0));
    const min = Math.floor(safe / 60);
    const sec = safe % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  /**
   * Aciona inicio do torneio de forma idempotente.
   * @private
   */
  async #tryStartTournament() {
    if (this.#isStartingTournament) return;

    this.#isStartingTournament = true;
    try {
      const result = await this.#tournamentService.startIfCountdownElapsed();
      console.log(`[TournamentRound] startIfCountdownElapsed started=${result?.started}`);
    } catch (error) {
      console.error('[TournamentRound] Erro ao iniciar torneio automaticamente:', error);
    } finally {
      this.#isStartingTournament = false;
    }
  }

  /**
   * @private
   */
  async #maybeNavigateToCurrentMatch() {
    const state = this.#currentTournament;
    if (!state || !this.#myUid) return;

    const isJoined = !!state.enrolledUsers?.[this.#myUid];
    if (!isJoined) return;

    if (state.status === 'countdown') {
      void this.#tryStartTournament();
      return;
    }

    if (state.status !== 'active') return;
    const matchId = state.currentMatchId || null;
    if (!matchId) return;
    if (this.#navigatedMatchId === matchId) return;

    const playersMap = state.activePlayers && Object.keys(state.activePlayers).length > 0
      ? state.activePlayers
      : state.enrolledUsers;

    const players = Object.entries(playersMap || {})
      .map(([uid, value]) => ({
        uid,
        name: value?.name || 'Jogador',
        avatarUrl: value?.avatarUrl || '',
        joinedAt: Number(value?.joinedAt || Date.now()),
      }))
      .sort((a, b) => Number(a.joinedAt || 0) - Number(b.joinedAt || 0));

    if (players.length < 2) return;

    this.#navigatedMatchId = matchId;
    console.log(`[TournamentRound] redirect to match matchId=${matchId} instanceId=${state.instanceId}`);

    await this.#screenManager.show('GameTableScreen', {
      matchId,
      roomType: 'tournament',
      players,
      myUid: this.#myUid,
      tournamentId: state.tournamentId,
      tournamentInstanceId: state.instanceId,
    });
  }

  /**
   * Handler: usuário clica para participar do torneio.
   * @private
   */
  async #onJoinTournament() {
    if (this.#isJoiningTournament) {
      return;
    }

    const currentUser = await AuthService.getInstance().getCurrentUser().catch(() => null);
    if (!currentUser?.uid) {
      this.#statusBannerEl.textContent = 'Voce precisa estar logado para participar do campeonato.';
      return;
    }

    this.#myUid = currentUser.uid;
    this.#isJoiningTournament = true;
    this.#renderTournamentState();

    try {
      const result = await this.#tournamentService.joinCurrentTournament();
      if (result?.joined) {
        this.#justJoinedAt = Date.now();
        this.#statusBannerEl.textContent = 'Inscricao confirmada. Aguarde os demais participantes.';
      } else if (result?.alreadyJoined) {
        this.#statusBannerEl.textContent = 'Voce ja esta inscrito nesta rodada.';
      }
      console.log(
        `[TournamentRound] join result joined=${result.joined} alreadyJoined=${result.alreadyJoined} instanceId=${result.instanceId}`
      );
    } catch (error) {
      console.error('[TournamentRound] Falha ao participar do campeonato:', error);
      const message = String(error?.message || '');
      this.#statusBannerEl.textContent = message.includes('nao autenticado')
        ? 'Sessao expirada. Faca login novamente para participar.'
        : message.includes('Inscricao em andamento')
          ? 'Sua inscricao ja esta sendo processada. Aguarde alguns segundos.'
          : 'Nao foi possivel participar agora. Tente novamente.';
    } finally {
      this.#isJoiningTournament = false;
      this.#renderTournamentState();
    }
  }
}
