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
  }

  /**
   * Inicializa listeners realtime do torneio e ranking.
   * @private
   */
  async #startRealtimeBindings() {
    this.#unsubTournament?.();
    this.#unsubLeaderboard?.();

    this.#unsubTournament = await this.#tournamentService.subscribeCurrentTournament((state) => {
      this.#currentTournament = state;
      this.#renderTournamentState();
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
    if (!this.#currentTournament || !this.#tournamentCard) return;

    const enrolledCount = Number(this.#currentTournament.enrolledCount || 0);
    const maxParticipants = Number(this.#currentTournament.maxParticipants || 0);
    const missing = Math.max(0, maxParticipants - enrolledCount);
    const status = this.#currentTournament.status || 'waiting';
    const isJoined = !!(this.#myUid && this.#currentTournament.enrolledUsers?.[this.#myUid]);

    this.#tournamentCard.update(this.#currentTournament);

    const joinBtn = this.#tournamentCard
      .getElement()
      ?.querySelector('.tournament-card__join-btn');

    if (joinBtn) {
      joinBtn.disabled = isJoined || status === 'active';
      joinBtn.textContent = isJoined
        ? 'INSCRITO'
        : status === 'active'
          ? 'EM ANDAMENTO'
          : 'PARTICIPAR';
    }

    if (status === 'waiting') {
      this.#statusBannerEl.textContent = missing > 0
        ? `Faltam ${missing} jogador${missing > 1 ? 'es' : ''} para completar o campeonato.`
        : 'Vagas completas. Countdown sera iniciado automaticamente.';
      this.#countdownEl.classList.add('tournament-screen__countdown--hidden');
      this.#clearCountdownTicker();
      return;
    }

    if (status === 'countdown') {
      this.#statusBannerEl.textContent = 'Campeonato completo. Inicio automatico em andamento.';
      this.#countdownEl.classList.remove('tournament-screen__countdown--hidden');
      this.#startCountdownTicker(Number(this.#currentTournament.countdownEndsAt || 0));
      return;
    }

    if (status === 'active') {
      this.#statusBannerEl.textContent = 'Campeonato iniciado! Boa sorte a todos.';
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
      const started = await this.#tournamentService.startIfCountdownElapsed();
      console.log(`[Tournament] startIfCountdownElapsed started=${started}`);
    } catch (error) {
      console.error('[Tournament] Erro ao iniciar torneio automaticamente:', error);
    } finally {
      this.#isStartingTournament = false;
    }
  }

  /**
   * Handler: usuário clica para participar do torneio.
   * @private
   */
  async #onJoinTournament() {
    try {
      const result = await this.#tournamentService.joinCurrentTournament();
      console.log(
        `[Tournament] join result joined=${result.joined} alreadyJoined=${result.alreadyJoined}`
      );
    } catch (error) {
      console.error('[Tournament] Falha ao participar do campeonato:', error);
      this.#statusBannerEl.textContent = 'Nao foi possivel participar agora. Tente novamente.';
    }
  }
}
