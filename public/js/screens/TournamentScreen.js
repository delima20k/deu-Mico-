/**
 * @layer screens
 * @group game
 * @role Screen
 * @depends Screen, HeaderBar, TournamentCard
 * @exports TournamentScreen
 *
 * Tela de campeonato.
 * Exibe: torneio atual, botão participar, leaderboard top 50.
 * Estrutura pronta para integração com pontuação futura.
 */
import { Screen } from '../core/Screen.js';
import { HeaderBar } from '../components/HeaderBar.js';
import { TournamentCard } from '../components/TournamentCard.js';
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

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    super('TournamentScreen');
    this.#screenManager = screenManager;
    this.#loadTournamentData();
  }

  /**
   * Carrega dados do torneio (simulado com localStorage).
   * @private
   */
  #loadTournamentData() {
    // Torneio atual (simular)
    this.#currentTournament = JSON.parse(
      localStorage.getItem('current_tournament') || '{}'
    ) || {
      id: '2026_march_1',
      name: 'Campeonato de Março 2026',
      startDate: new Date().toISOString(),
      prize: '🏆 Prêmios em ouro virtual',
      enrolledCount: 42,
    };

    // Leaderboard (simular top 50)
    this.#leaderboard = JSON.parse(
      localStorage.getItem('tournament_leaderboard') || '[]'
    ) || this.#generateMockLeaderboard();
  }

  /**
   * Gera leaderboard mockado para demonstração.
   * @private
   * @returns {Array}
   */
  #generateMockLeaderboard() {
    const names = [
      'Alan', 'Bruno', 'Carlos', 'Diego', 'Emília',
      'Fernanda', 'Gustavo', 'Helena', 'Igor', 'Júlia',
    ];
    const leaderboard = [];
    for (let i = 0; i < 50; i++) {
      leaderboard.push({
        rank: i + 1,
        name: names[i % names.length] + ` ${Math.floor(i / 10) + 1}`,
        points: 1000 - (i * 10),
        wins: Math.floor(Math.random() * 50),
      });
    }
    return leaderboard;
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
      tournament: this.#currentTournament,
      onJoin: () => this.#onJoinTournament(),
    });

    tournamentSection.append(sectionTitle, this.#tournamentCard.create());

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
  }

  /**
   * Limpa ao sair da tela.
   */
  onExit() {
    // Cleanup se necessário
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
    ['Posição', 'Nome', 'Pontos', 'Vitórias'].forEach(col => {
      const th = Dom.create('th', { text: col });
      headerRow.append(th);
    });
    thead.append(headerRow);

    // Body
    const tbody = Dom.create('tbody');
    this.#leaderboard.forEach(entry => {
      const tr = Dom.create('tr');

      const rankTd = Dom.create('td', { text: `${entry.rank}º` });
      const nameTd = Dom.create('td', { text: entry.name });
      const pointsTd = Dom.create('td', { text: `${entry.points}` });
      const winsTd = Dom.create('td', { text: `${entry.wins}` });

      tr.append(rankTd, nameTd, pointsTd, winsTd);
      tbody.append(tr);
    });

    table.append(thead, tbody);
    return table;
  }

  /**
   * Handler: usuário clica para participar do torneio.
   * @private
   */
  #onJoinTournament() {
    console.log('[TournamentScreen] Participando do torneio');
    // Simula inscrição no torneio
    localStorage.setItem(`enrolled_tournament_${this.#currentTournament.id}`, 'true');
    this.#currentTournament.enrolledCount =
      (this.#currentTournament.enrolledCount || 0) + 1;
    this.#tournamentCard?.update(this.#currentTournament);
  }
}
