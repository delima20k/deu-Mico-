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
import { SideMenu } from '../components/SideMenu.js';
import { TournamentCard } from '../components/TournamentCard.js';
import { LobbyCard } from '../components/LobbyCard.js';
import { TournamentService } from '../services/TournamentService.js';
import { TournamentRepository } from '../repositories/TournamentRepository.js';
import { AuthService } from '../services/AuthService.js';
import { Dom } from '../utils/Dom.js';
import { AdService } from '../services/adService.js';
import { AdConfig } from '../services/adConfig.js';
import { MatchService } from '../services/MatchService.js';
import { UserProfile } from '../domain/UserProfile.js';
import { App } from '../core/App.js';

export class TournamentScreen extends Screen {
  /** @type {import('../core/ScreenManager.js').ScreenManager} */
  #screenManager;

  /** @type {HeaderBar} */
  #headerBar;

  /** @type {SideMenu|null} */
  #sideMenu = null;

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

  /** @type {HTMLElement|null} */
  #finalStandingsWrapEl = null;

  /** @type {HTMLElement|null} */
  #finalStandingsTbodyEl = null;

  /** @type {ReturnType<typeof setInterval>|null} */
  #countdownInterval = null;

  /** @type {boolean} */
  #isStartingTournament = false;

  /** @type {boolean} */
  #isJoiningTournament = false;

  /** @type {boolean} */
  #isLeavingTournament = false;

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

  /** @type {HTMLButtonElement|null} */
  #rewardTournamentBtnEl = null;

  /** @type {HTMLButtonElement|null} */
  #rewardRankingBtnEl = null;

  /** @type {HTMLElement|null} */
  #rewardTournamentHintEl = null;

  /** @type {HTMLElement|null} */
  #rewardRankingHintEl = null;
  /** @type {LobbyCard|null} Card de espera reutilizando div.lobby-card para exibir inscritos */
  #enrollmentCard = null;

  /** @type {HTMLElement|null} Wrapper que controla visibilidade do #enrollmentCard */
  #enrollmentCardWrapperEl = null;

  /** @type {HTMLElement|null} Banner mostrando quantidade de partidas ativas em tempo real */
  #activeMatchesBannerEl = null;
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
    const authService = AuthService.getInstance();
    const currentUser = await authService.getCurrentUser().catch(() => null);
    this.#myUid = currentUser?.uid || null;

    if (!this.#myUid) {
      this.#screenManager.show('LoginScreen');
      return;
    }

    // LIMPEZA FORÇADA: Valida e remove inscrição stale do índice ao entrar na tela.
    // Cobre: claims expirados, instâncias encerradas/ativas sem assento e
    // instâncias waiting/countdown de rodadas antigas (> 48h).
    // Garante que o botão PARTICIPAR sempre funcione após rodadas anteriores.
    try {
      const tournamentId = await this.#tournamentService.getCurrentTournamentId();
      const repo = TournamentRepository.getInstance();
      await repo.validateAndCleanEnrollmentIndex(tournamentId, this.#myUid);
    } catch (err) {
      // Silencioso — falha de limpeza não bloqueia carregamento
    }

    const profile = await authService.getProfile(this.#myUid).catch(() => null);
    const menuProfile = profile || new UserProfile({
      uid: this.#myUid,
      email: currentUser?.email || '',
      name: currentUser?.displayName || (currentUser?.email ? currentUser.email.split('@')[0] : 'Jogador'),
      avatarUrl: currentUser?.photoURL || null,
    });

    // Header
    this.#headerBar = new HeaderBar();
    const headerEl = this.#headerBar.create();
    container.append(headerEl);

    // SideMenu
    this.#sideMenu = new SideMenu(menuProfile);
    const sideMenuEl = this.#sideMenu.create();
    container.append(sideMenuEl);

    this.#headerBar.onToggleMenu(() => this.#sideMenu?.toggle());
    this.#sideMenu.on('salas', () => {
      this.#screenManager.show('RoomsScreen');
    });
    this.#sideMenu.on('ranking', () => {
      this.#screenManager.show('MenuScreen', { openGeneralRanking: true });
    });
    this.#sideMenu.on('campeonato', () => {
      // Já está na tela de campeonato.
    });
    this.#sideMenu.on('logout', () => {
      App.markIntentionalLogout();
      this.#screenManager.show('LoginScreen');
    });

    // Botão para sair da tela de campeonato
    const btnBack = Dom.create('button', {
      classes: 'app-nav-back-btn tournament-screen__back-btn',
      text: '← Voltar ao menu',
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

    // Banner de partidas ativas em tempo real
    this.#activeMatchesBannerEl = Dom.create('div', {
      classes: 'tournament-screen__active-matches-banner tournament-screen__active-matches-banner--hidden',
      text: '',
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
      onLeave: () => this.#onLeaveTournament(),
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

    this.#finalStandingsWrapEl = this.#buildFinalStandingsTable();
    this.#finalStandingsWrapEl.classList.add('tournament-screen__final-standings--hidden');

    // Card de espera da rodada — reutiliza div.lobby-card (mesmo componente OOP de RoomsScreen)
    // Exibido quando o jogador está inscrito e a rodada está em waiting/countdown.
    this.#enrollmentCard = new LobbyCard({
      playersCount: TournamentService.DEFAULT_MAX_PARTICIPANTS,       // atualizado dinamicamente pelo maxParticipants da instância
      queueKey: 'tournament',
      presenceCount: 0,
      label: null,  // título dinâmico via updateCount(count, max)
      buttonLabel: 'Desistir',
      onJoin: () => this.#onLeaveTournament(),
    });
    this.#enrollmentCardWrapperEl = Dom.create('div', {
      classes: 'tournament-screen__enrollment-card',
    });
    this.#enrollmentCardWrapperEl.style.display = 'none';
    this.#enrollmentCardWrapperEl.append(this.#enrollmentCard.create());

    const tournamentRewardSlot = Dom.create('div', {
      classes: 'reward-slot tournament-screen__reward-slot',
      attrs: { id: 'rewarded-tournament-slot' },
    });
    this.#rewardTournamentBtnEl = Dom.create('button', {
      classes: 'reward-slot__btn',
      text: 'Assistir video e desbloquear beneficios',
      attrs: { type: 'button' },
    });
    this.#rewardTournamentHintEl = Dom.create('p', {
      classes: 'tournament-screen__reward-hint',
      text: 'Disponivel para partidas de campeonato com 3+ jogadores.',
    });
    this.#rewardTournamentBtnEl.addEventListener('click', () => {
      void this.#onWatchRewardedBenefits('tournament');
    });
    tournamentRewardSlot.append(this.#rewardTournamentBtnEl, this.#rewardTournamentHintEl);

    const tournamentAdBanner = Dom.create('div', {
      classes: 'ad-slot tournament-screen__ad-slot',
      attrs: { id: 'ad-banner-tournament' },
    });

    tournamentSection.append(
      sectionTitle,
      this.#activeMatchesBannerEl,
      tournamentCardEl,
      this.#statusBannerEl,
      this.#countdownEl,
      this.#finalStandingsWrapEl,
      this.#enrollmentCardWrapperEl,
      tournamentRewardSlot,
      tournamentAdBanner,
    );

    // Seção leaderboard
    const leaderboardSection = Dom.create('section', {
      classes: 'tournament-screen__leaderboard-section',
    });

    const leaderboardTitle = Dom.create('h2', {
      classes: 'tournament-screen__section-title',
      text: 'Ranking Top 50',
    });

    const leaderboardTable = this.#buildLeaderboardTable();
    const rankingRewardSlot = Dom.create('div', {
      classes: 'reward-slot tournament-screen__reward-slot',
      attrs: { id: 'rewarded-ranking-slot' },
    });
    this.#rewardRankingBtnEl = Dom.create('button', {
      classes: 'reward-slot__btn',
      text: 'Assistir video (Ranking) e ganhar beneficio',
      attrs: { type: 'button' },
    });
    this.#rewardRankingHintEl = Dom.create('p', {
      classes: 'tournament-screen__reward-hint',
      text: 'Beneficios validos para a partida atual do campeonato (3+ jogadores).',
    });
    this.#rewardRankingBtnEl.addEventListener('click', () => {
      void this.#onWatchRewardedBenefits('ranking');
    });
    rankingRewardSlot.append(this.#rewardRankingBtnEl, this.#rewardRankingHintEl);

    const rankingAdBanner = Dom.create('div', {
      classes: 'ad-slot tournament-screen__ad-slot',
      attrs: { id: 'ad-banner-ranking' },
    });

    leaderboardSection.append(
      leaderboardTitle,
      leaderboardTable,
      rankingRewardSlot,
      rankingAdBanner,
    );

    // Container principal
    const mainContainer = Dom.create('main', { classes: 'tournament-screen__main' });
    mainContainer.append(btnBack, title, tournamentSection, leaderboardSection);

    container.append(mainContainer);

    AdService.getInstance().showBanner(AdConfig.bannerPlacements.tournament);
    AdService.getInstance().showBanner(AdConfig.bannerPlacements.ranking);

    this.#refreshRewardButtonsState();

    await this.#startRealtimeBindings();
  }

  /**
   * Limpa ao sair da tela.
   */
  onExit() {
    this.#sideMenu?.close();
    this.#sideMenu = null;

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
    this.#isLeavingTournament = false;

    this.#rewardTournamentBtnEl = null;
    this.#rewardRankingBtnEl = null;
    this.#rewardTournamentHintEl = null;
    this.#rewardRankingHintEl = null;
    this.#finalStandingsWrapEl = null;
    this.#finalStandingsTbodyEl = null;

    this.#enrollmentCard = null;
    this.#enrollmentCardWrapperEl = null;
    this.#activeMatchesBannerEl = null;

    AdService.getInstance().hideBanner(AdConfig.bannerPlacements.tournament);
    AdService.getInstance().hideBanner(AdConfig.bannerPlacements.ranking);
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
          const activeCount = selected.activePlayers 
            ? Object.keys(selected.activePlayers).length 
            : nextEnrolledCount;
          const maxCount = Number(selected.maxParticipants || 6);
          this.#showSystemNotice(`${activeCount}/${maxCount} jogadores. Combate comeca em 1 minuto.`);
        }
      }

      this.#currentTournament = selected;
      this.#lastEnrolledCount = selected ? nextEnrolledCount : null;
      this.#renderTournamentState();
      this.#refreshRewardButtonsState();
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
   * Constrói bloco de classificação final da rodada.
   * @private
   * @returns {HTMLElement}
   */
  #buildFinalStandingsTable() {
    const wrap = Dom.create('section', { classes: 'tournament-screen__final-standings' });
    const title = Dom.create('h3', {
      classes: 'tournament-screen__final-standings-title',
      text: 'Classificação final da rodada',
    });

    const table = Dom.create('table', { classes: 'tournament-screen__final-standings-table' });
    const thead = Dom.create('thead');
    const headerRow = Dom.create('tr');
    ['Posição', 'Jogador', 'Pares', 'Pontos'].forEach((col) => {
      headerRow.append(Dom.create('th', { text: col }));
    });
    thead.append(headerRow);

    const tbody = Dom.create('tbody');
    this.#finalStandingsTbodyEl = tbody;
    table.append(thead, tbody);

    wrap.append(title, table);
    return wrap;
  }

  /**
   * Renderiza linhas da classificação final da rodada.
   * @param {Array<Object>} standings
   * @private
   */
  #renderFinalStandingsRows(standings) {
    if (!this.#finalStandingsTbodyEl) return;
    this.#finalStandingsTbodyEl.innerHTML = '';

    const rows = Array.isArray(standings) ? standings : [];
    if (!rows.length) {
      const tr = Dom.create('tr');
      tr.append(Dom.create('td', {
        text: 'Resultado final ainda indisponível.',
        attrs: { colspan: '4' },
      }));
      this.#finalStandingsTbodyEl.append(tr);
      return;
    }

    rows.forEach((entry, index) => {
      const tr = Dom.create('tr', {
        classes: index === 0
          ? 'tournament-screen__final-standings-row--champion'
          : index === 1
            ? 'tournament-screen__final-standings-row--runner-up'
            : '',
      });

      tr.append(Dom.create('td', { text: `${entry.rank || (index + 1)}º` }));
      tr.append(Dom.create('td', { text: entry.name || 'Jogador' }));
      tr.append(Dom.create('td', { text: `${Number(entry.pairs || 0)}` }));
      tr.append(Dom.create('td', { text: `${entry.points ?? (Number(entry.pointsMilli || 0) / 1000).toFixed(2)}` }));

      this.#finalStandingsTbodyEl.append(tr);
    });
  }

  /**
   * Renderiza status do torneio atual.
   * @private
   */
  #renderTournamentState() {
    if (!this.#tournamentCard) return;

    // Contador de partidas REAIS ativas em tempo real.
    // Uma partida activa é real apenas se possui currentMatchId (partida criada)
    // e foi iniciada nas últimas 12h (evita exibir instâncias stale do Firebase).
    const allInstances = Array.isArray(this.#currentRealtimeState?.instances)
      ? this.#currentRealtimeState.instances : [];
    const MAX_ACTIVE_MATCH_AGE_MS = 12 * 60 * 60 * 1000; // 12h
    const nowTs = Date.now();
    const activeMatchesCount = allInstances.filter(i => {
      if (i?.status !== 'active') return false;
      if (!i.currentMatchId) return false; // sem partida real criada
      const startedAt = Number(i.startedAt || 0);
      return startedAt > 0 && (nowTs - startedAt) < MAX_ACTIVE_MATCH_AGE_MS;
    }).length;
    if (this.#activeMatchesBannerEl) {
      if (activeMatchesCount > 0) {
        this.#activeMatchesBannerEl.textContent =
          `🎮 ${activeMatchesCount} partida${activeMatchesCount > 1 ? 's' : ''} em andamento agora`;
        this.#activeMatchesBannerEl.classList.remove('tournament-screen__active-matches-banner--hidden');
      } else {
        this.#activeMatchesBannerEl.textContent = '';
        this.#activeMatchesBannerEl.classList.add('tournament-screen__active-matches-banner--hidden');
      }
    }

    const state = this.#currentTournament;
    if (!state) {
      this.#statusBannerEl.textContent = 'Aguardando abertura de nova rodada de campeonato...';
      this.#finalStandingsWrapEl?.classList.add('tournament-screen__final-standings--hidden');
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
      joinBtn.disabled = this.#isJoiningTournament || this.#isLeavingTournament || isJoined || status === 'active';
      joinBtn.textContent = this.#isJoiningTournament
        ? 'INSCREVENDO...'
        : isJoined
        ? 'INSCRITO'
        : status === 'active'
          ? 'EM ANDAMENTO'
          : 'PARTICIPAR';
    }

    const leaveBtn = this.#tournamentCard
      .getElement()
      ?.querySelector('.tournament-card__leave-btn');

    if (leaveBtn) {
      const canLeave = isJoined && status !== 'active';
      leaveBtn.disabled = this.#isJoiningTournament || this.#isLeavingTournament || !canLeave;
      leaveBtn.textContent = this.#isLeavingTournament
        ? 'DESISTINDO...'
        : 'DESISTIR DO CAMPEONATO';
    }

    // Enrollment LobbyCard — reutiliza div.lobby-card para exibir inscritos na sala de espera.
    // Visível apenas quando o jogador está inscrito e a rodada ainda não terminou.
    if (this.#enrollmentCard && this.#enrollmentCardWrapperEl) {
      const showCard = isJoined && (status === 'waiting' || status === 'countdown');
      this.#enrollmentCardWrapperEl.style.display = showCard ? '' : 'none';
      if (showCard) {
        const maxCount = Number(state.maxParticipants || 6);
        this.#enrollmentCard.updateCount(enrolledCount, maxCount);
        // Atualiza label e estado do botão conforme o status da rodada
        const btn = this.#enrollmentCardWrapperEl.querySelector('.lobby-card__button');
        if (btn) {
          const inCountdown = status === 'countdown';
          btn.disabled = inCountdown || this.#isLeavingTournament;
          btn.textContent = inCountdown ? 'Aguardando início...' : 'Desistir';
        }
      }
    }

    if (status === 'waiting') {
      this.#finalStandingsWrapEl?.classList.add('tournament-screen__final-standings--hidden');
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
      this.#finalStandingsWrapEl?.classList.add('tournament-screen__final-standings--hidden');
      // Durante countdown, mostra quantidade atual de jogadores ativos
      const activeCount = state.activePlayers 
        ? Object.keys(state.activePlayers).length 
        : enrolledCount;
      const maxCount = Number(state.maxParticipants || 6);
      this.#statusBannerEl.textContent = `${activeCount}/${maxCount} jogadores. Combate comeca em 1 minuto.`;
      this.#countdownEl.classList.remove('tournament-screen__countdown--hidden');
      this.#startCountdownTicker(Number(state.countdownEndsAt || 0));
      return;
    }

    if (status === 'active') {
      this.#finalStandingsWrapEl?.classList.add('tournament-screen__final-standings--hidden');
      this.#statusBannerEl.textContent = 'Partida em andamento. Aguardando abertura de nova vaga...';
      this.#countdownEl.classList.add('tournament-screen__countdown--hidden');
      this.#clearCountdownTicker();
      return;
    }

    if (status === 'finished') {
      const championUid = state.championUid || null;
      const championName = state?.finalStandings?.[0]?.name
        || (championUid ? (state.enrolledUsers?.[championUid]?.name || 'Jogador') : 'Indefinido');
      const runnerUpName = state?.finalStandings?.[1]?.name || null;
      this.#statusBannerEl.textContent = `Rodada finalizada. Campeão: ${championName}.`;
      if (runnerUpName) {
        this.#statusBannerEl.textContent += ` Vice-campeão: ${runnerUpName}.`;
      }
      this.#countdownEl.classList.add('tournament-screen__countdown--hidden');
      this.#clearCountdownTicker();
      this.#finalStandingsWrapEl?.classList.remove('tournament-screen__final-standings--hidden');
      this.#renderFinalStandingsRows(state.finalStandings || []);
    }

    this.#refreshRewardButtonsState();
  }

  /**
   * @returns {{eligible:boolean, matchId:string|null, playersCount:number, status:string}}
   * @private
   */
  #resolveRewardEligibility() {
    const state = this.#currentTournament;
    const status = String(state?.status || 'waiting');
    const matchId = state?.currentMatchId || null;
    const playersCount = state?.activePlayers
      ? Object.keys(state.activePlayers || {}).length
      : Number(state?.enrolledCount || 0);

    const eligible = status === 'active' && !!matchId && playersCount >= 3;
    return {
      eligible,
      matchId,
      playersCount,
      status,
    };
  }

  /** @private */
  #refreshRewardButtonsState() {
    const eligibility = this.#resolveRewardEligibility();
    const canUseRewarded = AdConfig.enableRewarded;

    const btns = [this.#rewardTournamentBtnEl, this.#rewardRankingBtnEl].filter(Boolean);
    btns.forEach((btn) => {
      btn.disabled = !canUseRewarded || !eligibility.eligible;
      btn.textContent = eligibility.eligible
        ? 'Assistir video e liberar beneficios da partida'
        : 'Rewarded disponivel no inicio da partida (3+ jogadores)';
    });

    const hints = [this.#rewardTournamentHintEl, this.#rewardRankingHintEl].filter(Boolean);
    let hintText = 'Disponivel para partidas de campeonato com 3+ jogadores.';
    if (!canUseRewarded) {
      hintText = 'Rewarded desativado na configuracao atual.';
    } else if (eligibility.status !== 'active' || !eligibility.matchId) {
      hintText = 'Quando a rodada iniciar, voce pode assistir e liberar beneficios para a partida.';
    } else if (eligibility.playersCount < 3) {
      hintText = 'Esta partida tem menos de 3 jogadores. Beneficios indisponiveis.';
    }

    hints.forEach((hintEl) => {
      hintEl.textContent = hintText;
    });
  }

  /**
   * @param {'tournament'|'ranking'} source
   * @private
   */
  async #onWatchRewardedBenefits(source) {
    if (!AdConfig.enableRewarded) return;

    const btnPrimary = source === 'ranking' ? this.#rewardRankingBtnEl : this.#rewardTournamentBtnEl;
    const hintPrimary = source === 'ranking' ? this.#rewardRankingHintEl : this.#rewardTournamentHintEl;
    const eligibility = this.#resolveRewardEligibility();

    if (!eligibility.eligible || !eligibility.matchId || !this.#myUid) {
      if (hintPrimary) {
        hintPrimary.textContent = 'Beneficio so pode ser ativado com partida ativa de campeonato (3+ jogadores).';
      }
      this.#refreshRewardButtonsState();
      return;
    }

    if (btnPrimary) {
      btnPrimary.disabled = true;
      btnPrimary.textContent = 'Carregando...';
    }

    const result = await AdService.getInstance()
      .showRewarded(source === 'ranking'
        ? AdConfig.rewardedTriggers.rankingBenefits
        : AdConfig.rewardedTriggers.tournamentBenefits)
      .catch(() => ({ rewarded: false }));

    if (!result.rewarded) {
      if (hintPrimary) {
        hintPrimary.textContent = 'Video nao concluido. Nenhum beneficio foi liberado.';
      }
      this.#refreshRewardButtonsState();
      return;
    }

    AdService.getInstance().grantReward(AdConfig.rewardTypes.tournamentBenefits);
    AdService.getInstance().grantReward(AdConfig.rewardTypes.revealMico);
    AdService.getInstance().grantReward(AdConfig.rewardTypes.dealerSkipLeft);

    await MatchService.getInstance().grantTournamentMatchBenefits(
      eligibility.matchId,
      this.#myUid,
      {
        grantRevealMico: true,
        grantDealerSkipLeft: true,
        source: `tournament_screen_${source}`,
      },
    ).catch((error) => {
      console.error('[TournamentScreen] Falha ao gravar beneficios rewarded:', error);
    });

    if (hintPrimary) {
      hintPrimary.textContent = 'Beneficios liberados para esta partida: revelar Mico (1x) e pular 1 jogador na distribuicao se voce for dealer.';
    }
    if (btnPrimary) {
      btnPrimary.textContent = 'Beneficios liberados para a partida atual';
    }

    this.#refreshRewardButtonsState();
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
      // Mostra apenas instâncias onde o usuário está ESPERANDO (waiting ou countdown)
      // Se usuário está em partida ativa (active), mostra a joinable para que possa
      // ver o próximo torneio disponível — o redirect para a partida é feito por #maybeNavigateToCurrentMatch
      const myWaitingInstance = instances.find((instance) => {
        const hasMe = !!instance?.enrolledUsers?.[this.#myUid];
        const status = instance?.status || 'waiting';
        if (!hasMe || status === 'finished') return false;
        return status === 'waiting' || status === 'countdown';
      }) || null;

      if (myWaitingInstance) {
        return myWaitingInstance;
      }
    }

    return state?.joinableInstance || state?.selectedInstance || null;
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
    const isActivePlayer = !!state?.activePlayers?.[this.#myUid];
    if (!isActivePlayer) return;
    const matchId = state.currentMatchId || null;
    if (!matchId) return;
    if (this.#navigatedMatchId === matchId) return;

    // Não redireciona se o usuário saiu voluntariamente desta partida (via GameExitButton)
    if (this.#tournamentService.wasMatchLeftByUser(matchId)) return;

    // Valida se o usuário é realmente jogador desta partida antes de redirecionar
    try {
      const { MatchRepository } = await import('../repositories/MatchRepository.js');
      const match = await MatchRepository.getInstance().getMatchById(matchId);

      if (!match) {
        console.warn(`[TournamentRound] Partida ${matchId} não existe — redirect cancelado.`);
        this.#tournamentService.recordUserLeftMatch(matchId);
        this.#navigatedMatchId = matchId;
        return;
      }

      const matchState = match.getState();
      if (['finished', 'abandoned', 'ended', 'cancelled'].includes(matchState)) {
        console.warn(`[TournamentRound] Partida ${matchId} encerrada (${matchState}) — redirect cancelado.`);
        this.#tournamentService.recordUserLeftMatch(matchId);
        this.#navigatedMatchId = matchId;
        return;
      }

      if (this.#myUid && !match.hasPlayer(this.#myUid)) {
        console.warn(`[TournamentRound] Usuário não é jogador da partida ${matchId} — redirect cancelado.`);
        this.#tournamentService.recordUserLeftMatch(matchId);
        this.#navigatedMatchId = matchId;
        return;
      }
    } catch (error) {
      const isPermissionDenied = String(error?.message || error).includes('permission_denied');
      if (isPermissionDenied) {
        console.warn(`[TournamentRound] Sem permissão para partida ${matchId} — usuário não é jogador ou partida encerrada. Redirect cancelado.`);
      } else {
        console.error('[TournamentRound] Erro ao validar partida antes de redirecionar:', error);
      }
      this.#tournamentService.recordUserLeftMatch(matchId);
      this.#navigatedMatchId = matchId;
      return;
    }

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

  /**
   * Handler: usuário clica para desistir do torneio.
   * @private
   */
  async #onLeaveTournament() {
    if (this.#isLeavingTournament) {
      return;
    }

    const currentUser = await AuthService.getInstance().getCurrentUser().catch(() => null);
    if (!currentUser?.uid) {
      this.#statusBannerEl.textContent = 'Voce precisa estar logado para desistir do campeonato.';
      return;
    }

    this.#myUid = currentUser.uid;
    this.#isLeavingTournament = true;
    this.#renderTournamentState();

    try {
      const result = await this.#tournamentService.leaveCurrentTournament();
      if (result?.left) {
        this.#statusBannerEl.textContent = 'Inscricao removida com sucesso.';
      } else if (result?.reason === 'instance_active') {
        this.#statusBannerEl.textContent = 'Nao e possivel desistir: a rodada ja iniciou.';
      } else {
        this.#statusBannerEl.textContent = 'Voce nao estava inscrito nesta rodada.';
      }
      console.log(
        `[TournamentRound] leave result left=${!!result?.left} reason=${result?.reason || 'none'} instanceId=${result?.instanceId || 'n/a'}`
      );
    } catch (error) {
      console.error('[TournamentRound] Falha ao desistir do campeonato:', error);
      this.#statusBannerEl.textContent = 'Nao foi possivel desistir agora. Tente novamente.';
    } finally {
      this.#isLeavingTournament = false;
      this.#renderTournamentState();
    }
  }
}
