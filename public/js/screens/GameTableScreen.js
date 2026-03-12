/**
 * @layer screens
 * @group game
 * @role Screen
 * @depends Screen, ScreenManager, GameTableView, TableLayoutService, Dom, HeaderBar, AuthService, UserRepository
 * @exports GameTableScreen
 *
 * Tela principal da mesa de jogo (fase 2-4: normal + tournament).
 * Gerencia o layout de jogadores de forma orientada a objetos.
 * Jogador logado sempre fica na posição inferior (bottom).
 * Demais jogadores distribuídos conforme quantidade (2-6 players).
 * Cada jogador exibe avatar e nome.
 */

import { Screen } from '../core/Screen.js';
import { Dom } from '../utils/Dom.js';
import { GameTableView } from '../components/GameTableView.js';
import { GameExitButton } from '../components/GameExitButton.js';
import { HexTable } from '../components/HexTable.js';
import CardDeckPile from '../components/CardDeckPile.js';
import { DeckActionPanel } from '../components/DeckActionPanel.js';
import { TableLayoutService } from '../services/TableLayoutService.js';
import { DealerSelectionService } from '../services/DealerSelectionService.js';
import { MatchService } from '../services/MatchService.js';
import { DeckShuffleAnimator } from '../components/DeckShuffleAnimator.js';
import { AuthService } from '../services/AuthService.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { buildAndShuffleDeck } from '../services/deck.js';

export class GameTableScreen extends Screen {
  /** @type {import('../core/ScreenManager.js').ScreenManager} */
  #screenManager;

  /** @type {string} ID da partida */
  #matchId;

  /** @type {string} Tipo de sala (2p, 3p, ..., 6p, tournament) */
  #roomType;

  /** @type {string} UID do jogador logado */
  #myUid;

  /** @type {Object[]} Array de jogadores {uid, name, avatarUrl, joinedAt?} */
  #players;

  /** @type {GameTableView} */
  #gameTableView;

  /** @type {HexTable|null} */
  #hexTable = null;

  /** @type {Function} - Unsubscriber do listener de monitoramento */
  #monitoringUnsubscribe = null;

  /** @type {Function[]} - Array de funções de limpeza */
  #cleanups = [];

  /** @type {GameExitButton|null} */
  #exitButton = null;

  /** @type {CardDeckPile|null} */
  #deckPile = null;

  /** @type {DeckActionPanel|null} */
  #deckActionPanel = null;

  /** @type {DeckShuffleAnimator|null} */
  #deckShuffleAnimator = null;

  /** @type {import('../domain/Card.js').Card[]|null} Baralho embaralhado da partida */
  #deck = null;

  /** @type {Function|null} Unsubscriber do monitor de presença */
  #presenceUnsub = null;

  /** @type {Set<string>|null} UIDs dos jogadores no snapshot anterior */
  #prevPlayerUids = null;

  /** @type {Object} Mapa uid->dados do último snapshot de presença */
  #presenceMap = {};

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    super('GameTableScreen');
    this.#screenManager = screenManager;
  }

  /**
   * Cria o template da tela.
   * @returns {HTMLElement}
   */
  _buildTemplate() {
    const wrapper = Dom.create('div', { classes: 'game-table-screen' });
    return wrapper;
  }

  /**
   * Renderiza a tela da mesa de jogo.
   * @param {Object} [params={}]
   * @param {string} [params.matchId] - ID da partida
   * @param {string} [params.roomType] - Tipo de sala (2p..6p ou tournament)
   * @param {Object[]} [params.players] - Array de jogadores
   * @param {string} [params.myUid] - UID do jogador logado
   */
  async onEnter(params = {}) {
    this.#matchId = params.matchId || 'match_test';
    this.#roomType = params.roomType || '2p';
    this.#myUid = params.myUid || this.#getCurrentUserUid();
    this.#players = params.players || await this.#generateMockPlayers();

    console.log(`\n[GameTableScreen] 🎮 ===== TELA DA MESA ABERTA =====`);
    console.log(`[GameTableScreen] 📋 ID da Partida: ${this.#matchId}`);
    console.log(`[GameTableScreen] 2️⃣ Tipo de Sala: ${this.#roomType}`);
    console.log(`[GameTableScreen] 👤 Seu UID: ${this.#myUid.slice(0, 16)}...`);
    console.log(`[GameTableScreen] 👥 Total de Jogadores: ${this.#players.length}`);
    console.log(`[GameTableScreen] ⏰ Timestamp: ${new Date().toISOString()}\n`);

    // Re-escreve a própria presença (aguarda) para garantir que o monitor
    // de presença captura snapshot completo com todos os jogadores
    await this.#writeOwnPresence();
    await this.#renderTable();
  }

  /**
   * Renderiza a mesa de jogo.
   * @private
   */
  async #renderTable() {
    const container = this.getElement();
    container.innerHTML = '';

    // Botão fixo "CORRER" no canto superior esquerdo
    this.#exitButton = new GameExitButton({
      onExitRequested: () => this.#onExitGame(),
    });
    container.append(this.#exitButton.create());

    // Container principal
    const mainEl = Dom.create('main', { classes: 'game-table-screen__main' });

    // Debug info (matchId no canto superior direito)
    const debugEl = Dom.create('div', {
      classes: 'game-table-screen__debug',
      text: `Match: ${this.#matchId} | ${this.#roomType}`
    });
    mainEl.append(debugEl);

    // ── Mesa hexagonal ──
    const tableRoot = Dom.create('div', { classes: 'game-table-root' });
    this.#hexTable  = new HexTable();
    const hexEl     = this.#hexTable.create();

    // Gera layout com TableLayoutService e coloca no slot do hexágono
    try {
      console.log(`[GameTableScreen] 🔨 Criando layout da mesa...`);
      const tableLayout = this.#createTableLayout();

      console.log(`[GameTableScreen] ✅ Layout criado com sucesso`);
      console.log(`[GameTableScreen] 🎨 Renderizando componentes visuais...`);

      this.#gameTableView = new GameTableView(tableLayout, this.#myUid, this.#roomType);
      const tableEl = this.#gameTableView.create();

      // Insere o conteúdo do jogo dentro do slot do hexágono
      this.#hexTable.getSlot().append(tableEl);

      // Insere o container de players DIRETAMENTE no hex-table (fora do inner)
      // para escapar do stacking context criado por transform: scale(0.88)
      const playersContainerEl = this.#gameTableView.getPlayersContainer();
      if (playersContainerEl) {
        hexEl.append(playersContainerEl);
      }

      // ── Monte de cartas + painel de ação (wrapper centralizado) ──
      const deckStack = Dom.create('div', { classes: 'deck-center-stack' });

      // Constrói o baralho real embaralhado (69 cartas)
      this.#deck = buildAndShuffleDeck();

      this.#deckPile = new CardDeckPile(tableEl);
      const deckEl = this.#deckPile.create();
      // Sincroniza contagem visual com o deck real
      this.#deckPile.renderCentralDeck(this.#deck);
      deckStack.append(deckEl);
      this.#deckShuffleAnimator = new DeckShuffleAnimator(deckEl);
      console.log('[CardDeckPile] ✅ Monte renderizado no centro da mesa');
      console.log(`[CardDeckPile] 🃏 Camadas visíveis: 6`);
      console.log(`[CardDeckPile] 📦 Total de cartas no deck: ${this.#deck.length}`);

      // Descobre o jogador mais novo para definir quem embaralha
      const dealerResult = await DealerSelectionService.getInstance()
        .resolveYoungestPlayer(this.#players);

      this.#deckActionPanel = new DeckActionPanel(
        this.#myUid,
        dealerResult.youngestPlayerUid,
        () => this.#onShuffleRequested()
      );
      deckStack.append(this.#deckActionPanel.create());

      tableEl.append(deckStack);

      console.log(`[GameTableScreen] ✨ Mesa renderizada com sucesso\n`);
    } catch (error) {
      console.error('[GameTableScreen] ❌ Erro ao criar layout:', error);
      const errorEl = Dom.create('div', {
        classes: 'game-table-screen__error',
        text: `Erro ao criar mesa: ${error.message}`
      });
      this.#hexTable.getSlot().append(errorEl);
    }

    tableRoot.append(hexEl);
    mainEl.append(tableRoot);

    // Botão "Ranking" (apenas em tournament)
    if (this.#roomType === 'tournament') {
      const btnRankingEl = Dom.create('button', {
        classes: 'game-table-screen__btn-ranking',
        text: '📊 Ranking',
        attrs: { type: 'button' }
      });
      btnRankingEl.addEventListener('click', () => this.#onViewRanking());
      mainEl.append(btnRankingEl);
    }

    container.append(mainEl);

    // Inicia monitor de presença para detectar quando alguém sai
    this.#startPresenceMonitor();
  }

  /**
   * Cria o TableLayout com base nos jogadores atuais.
   * Garante que myUid sempre fica em "bottom" e distribui os demais.
   * @private
   * @returns {import('../domain/TableLayout.js').TableLayout}
   */
  #createTableLayout() {
    const layoutService = TableLayoutService.getInstance();
    
    let playersCount = this.#players.length;
    if (playersCount < 2 || playersCount > 6) {
      console.warn(`[GameTableScreen] playersCount inválido: ${playersCount}, usando 2p como padrão`);
      playersCount = 2;
    }

    console.log(`[GameTableScreen] Criando layout para ${playersCount} jogadores`);
    console.log('[GameTableScreen] Jogadores:', this.#players.map(p => `${p.name} (${p.uid})`));
    console.log(`[GameTableScreen] Jogador logado: ${this.#myUid}`);

    const tableLayout = layoutService.createLayout(
      this.#players,
      this.#myUid,
      playersCount
    );

    // Log do layout criado
    tableLayout.seats.forEach((seat, idx) => {
      console.log(`  Seat ${idx}: ${seat.name} (${seat.positionKey})`);
    });

    return tableLayout;
  }

  /**
   * Método chamado quando a sala fica pronta (callback do GameRoomMonitor).
   * Identifica tipo de sala e posiciona jogadores.
   * Jogador logado sempre na posição inferior.
   * @static
   * @param {string[]} playerIds - Lista de UIDs dos jogadores na sala
   * @param {Object} lobbyData - Dados do lobby (LobbyType, etc)
   * @param {string} matchId - ID da partida criada
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  static async onRoomReady(playerIds, lobbyData, matchId, screenManager) {
    console.log(`\n[GameTableScreen.onRoomReady] 🎬 ===== INICIANDO TRANSIÇÃO PARA MESA =====`);
    console.log(`[GameTableScreen.onRoomReady] 📋 ID da Partida: ${matchId}`);
    console.log(`[GameTableScreen.onRoomReady] ⏰ Timestamp: ${new Date().toISOString()}`);

    try {
      // 1. Determina tipo da sala pela quantidade de jogadores
      const playersCount = playerIds.length;
      if (playersCount < 2 || playersCount > 6) {
        throw new Error(`Quantidade inválida de jogadores: ${playersCount}`);
      }
      const roomType = `${playersCount}p`;
      console.log(`[GameTableScreen.onRoomReady] 2️⃣ Tipo de Sala: ${roomType}`);

      // 2. Obtém UID do jogador logado
      console.log(`[GameTableScreen.onRoomReady] 🔐 Obtendo usuário logado...`);
      const currentUser = AuthService.getInstance().getCurrentUser();
      if (!currentUser) {
        throw new Error('Usuário não está logado');
      }
      const myUid = currentUser.uid;
      console.log(`[GameTableScreen.onRoomReady] ✅ Usuário identificado: ${myUid.slice(0, 16)}...`);

      // 3. Valida que jogador logado está na sala
      if (!playerIds.includes(myUid)) {
        throw new Error(`Jogador logado não está na sala: ${myUid}`);
      }

      // 4. Busca dados de cada jogador
      console.log(`[GameTableScreen.onRoomReady] 👥 Carregando dados de ${playersCount} jogadores...`);
      const userRepository = UserRepository.getInstance();
      const players = [];

      for (const uid of playerIds) {
        try {
          const userProfile = await userRepository.getProfile(uid);
          if (userProfile) {
            players.push({
              uid,
              name: userProfile.displayName || 'Jogador Desconhecido',
              avatarUrl: userProfile.photoURL || null,
              joinedAt: Date.now()
            });
            console.log(`[GameTableScreen.onRoomReady] ✅ ${userProfile.displayName || 'Jogador'} carregado`);
          } else {
            // Fallback se não encontrar perfil
            players.push({
              uid,
              name: `Jogador ${uid.slice(0, 8)}`,
              avatarUrl: null,
              joinedAt: Date.now()
            });
            console.log(`[GameTableScreen.onRoomReady] ⚠️ Perfil não encontrado para ${uid.slice(0, 8)}...`);
          }
        } catch (error) {
          console.error(`[GameTableScreen.onRoomReady] ❌ Erro ao buscar perfil de ${uid}:`, error);
          players.push({
            uid,
            name: `Jogador ${uid.slice(0, 8)}`,
            avatarUrl: null,
            joinedAt: Date.now()
          });
        }
      }

      console.log(`[GameTableScreen.onRoomReady] ✅ ${players.length} jogadores carregados com sucesso`);
      console.log(`[GameTableScreen.onRoomReady] 📋 Lista:`, players.map(p => `• ${p.name}`).join('\n                              '));

      // 5. Navega para GameTableScreen com parâmetros
      console.log(`[GameTableScreen.onRoomReady] 🚀 Navegando para GameTableScreen...`);
      screenManager.show('GameTableScreen', {
        matchId,
        roomType,
        players,
        myUid
      });
      console.log(`[GameTableScreen.onRoomReady] ✨ Transição concluída\n`);

    } catch (error) {
      console.error(`[GameTableScreen.onRoomReady] ❌ Erro na transição:`, error);
      // TODO: Exibir modal de erro e voltar para tela anterior
    }
  }

  /**
   * Limpa ao sair da tela.
   * Remove todos os listeners e realiza limpeza de recursos.
   */
  onExit() {
    console.log(`\n[GameTableScreen] 🚪 ===== SAINDO DA MESA =====`);
    console.log(`[GameTableScreen] 📋 ID da Partida: ${this.#matchId}`);
    console.log(`[GameTableScreen] ⏰ Timestamp: ${new Date().toISOString()}`);
    
    // Para monitor de presença
    this.#presenceUnsub?.();
    this.#presenceUnsub = null;
    this.#prevPlayerUids = null;
    this.#presenceMap = {};

    // Limpa monitoramento (listener do GameRoomMonitor)
    if (this.#monitoringUnsubscribe) {
      console.log(`[GameTableScreen] 🛑 Parando listener de monitoramento...`);
      this.#monitoringUnsubscribe();
      this.#monitoringUnsubscribe = null;
      console.log(`[GameTableScreen] ✅ Listener de monitoramento removido`);
    }

    // Executa todas as funções de limpeza registradas
    if (this.#cleanups.length > 0) {
      console.log(`[GameTableScreen] 🧹 Executando ${this.#cleanups.length} limpeza(s)...`);
      this.#cleanups.forEach((cleanup, idx) => {
        try {
          cleanup();
          console.log(`[GameTableScreen] ✅ Limpeza ${idx + 1}/${this.#cleanups.length} concluída`);
        } catch (error) {
          console.error(`[GameTableScreen] ❌ Erro na limpeza ${idx + 1}:`, error);
        }
      });
      this.#cleanups = [];
    }

    // Para todos os monitoramentos ativos (segurança)
    const gameRoomMonitor = window.GameRoomMonitor?.getInstance?.();
    if (gameRoomMonitor) {
      gameRoomMonitor.stopAllMonitoring();
    }

    console.log(`[GameTableScreen] 👋 Saída concluída\n`);
  }

  /**
   * Re-escreve a própria presença no Firebase ao entrar na mesa.
   * Garante que todos os monitores de presença encontrem os dados corretos.
   * @private
   */
  async #writeOwnPresence() {
    try {
      const userProfile = await UserRepository.getInstance().getProfile(this.#myUid);
      const userData = {
        name:      userProfile?.name      || 'Jogador',
        avatarUrl: userProfile?.avatarUrl || null,
      };
      await MatchService.getInstance().writePresence(this.#matchId, this.#myUid, userData);
      console.log(`[GameTableScreen] \u2705 Presença re-escrita uid=${this.#myUid.slice(0, 8)}...`);
    } catch (err) {
      console.warn('[GameTableScreen] Erro ao re-escrever presença (não crítico):', err);
    }
  }

  /**
   * Inicia listener de presença para detectar saída de jogadores.
   * Baseline é pré-populado de this.#players (lista definitiva recebida como parâmetro),
   * eliminando race condition com o primeiro snapshot do Firebase.
   * @private
   */
  #startPresenceMonitor() {
    this.#presenceUnsub?.();

    // Pré-popula baseline a partir da lista definitiva de jogadores
    // (evita race condition: não depende do primeiro snapshot do Firebase)
    this.#presenceMap = {};
    for (const p of this.#players) {
      this.#presenceMap[p.uid] = p;
    }
    this.#prevPlayerUids = new Set(this.#players.map(p => p.uid));

    this.#presenceUnsub = MatchService.getInstance().subscribePresence(
      this.#matchId,
      (players) => {
        // Mantém mapa de nomes atualizado (inclui entradas mais recentes do Firebase)
        for (const p of players) {
          if (p.uid && p.name) this.#presenceMap[p.uid] = p;
        }

        const currentUids = new Set(players.map(p => p.uid));

        // Detecta quem saiu comparando com snapshot anterior
        for (const uid of this.#prevPlayerUids) {
          if (!currentUids.has(uid) && uid !== this.#myUid) {
            const saved = this.#presenceMap[uid]
              || this.#players.find(p => p.uid === uid);
            const name = saved?.name || 'Jogador';
            // isWinner: havia só 2 no snapshot anterior → o restante é o vencedor
            const isWinner = this.#prevPlayerUids.size === 2;
            this.#showExitNotification(name, isWinner);
          }
        }

        this.#prevPlayerUids = currentUids;
      }
    );
  }

  /**
   * Exibe notificação em nuvem quando um jogador sai.
   * @param {string} name - Nome do jogador que saiu
   * @param {boolean} isWinner - true se eram só 2 (restant vence)
   * @private
   */
  #showExitNotification(name, isWinner) {
    const container = this.getElement();
    container.querySelector('.game-exit-notification')?.remove();

    const overlay = Dom.create('div', { classes: 'game-exit-notification' });
    const bubble  = Dom.create('div', { classes: 'game-exit-notification__bubble' });

    const icon = Dom.create('span', {
      classes: 'game-exit-notification__icon',
      text: isWinner ? '🏆' : '☁️',
    });

    const msg = Dom.create('p', { classes: 'game-exit-notification__text' });
    if (isWinner) {
      msg.innerHTML = `<strong>${name}</strong> saiu da partida.<br>Você é o <strong>vencedor</strong>! 🎉`;
    } else {
      msg.innerHTML = `<strong>${name}</strong> saiu da partida.`;
    }

    const btnClose = Dom.create('button', {
      classes: 'game-exit-notification__close',
      text: isWinner ? 'Ver Salas' : 'OK',
      attrs: { type: 'button' },
    });
    btnClose.addEventListener('click', () => {
      overlay.remove();
      if (isWinner) this.#screenManager.show('RoomsScreen');
    });

    bubble.append(icon, msg, btnClose);
    overlay.append(bubble);
    container.append(overlay);

    // Auto-fecha depois de 8s se não for vitória
    if (!isWinner) {
      setTimeout(() => overlay.isConnected && overlay.remove(), 8000);
    }
  }

  /**
   * Usuário confirmou sair da mesa (via GameExitButton).
   * Remove presença, para listeners e volta para RoomsScreen.
   * @private
   */
  async #onExitGame() {
    console.log(`[GameExit] clicked matchId=${this.#matchId} uid=${this.#myUid?.slice(0, 8)}...`);
    await MatchService.getInstance()
      .leaveMatch(this.#matchId, this.#myUid)
      .catch(err => console.error('[GameExit] erro no leaveMatch:', err));
    console.log('[GameExit] navigated to RoomsScreen');
    this.#screenManager.show('RoomsScreen');
  }

  /**
   * Handler do botão "EMBARALHAR AS CARTAS".
   * Orquestra: desabilitar botão → animar monte → trocar para "ENTREGAR CARTAS".
   * @private
   */
  #onShuffleRequested() {
    console.log('[DeckAction] shuffle requested');

    if (!this.#deckShuffleAnimator || !this.#deckActionPanel) return;

    this.#deckActionPanel.setState('shuffling');

    this.#deckShuffleAnimator.play().then(() => {
      this.#deckActionPanel.setState('readyToDeal');
    });
  }

  /**
   * Handler do botão "Ranking" (tournament mode).
   * @private
   */
  #onViewRanking() {
    console.log(`[GameTableScreen] Abrindo ranking para matchId="${this.#matchId}"`);
    this.#screenManager.show('TournamentScreen', { matchId: this.#matchId });
  }

  /**
   * Handler do botão "Sair da sala".
   * @private
   */
  #onLeaveRoom() {
    console.log('[GameTableScreen] Saindo da sala...');
    this.#screenManager.show('RoomsScreen');
  }

  /**
   * Registra uma função de limpeza a ser executada no onExit.
   * Usado por serviços/monitores para registrar seus unsubscribers.
   * @param {Function} cleanup - Função a ser executada na limpeza
   */
  registerCleanup(cleanup) {
    if (typeof cleanup === 'function') {
      this.#cleanups.push(cleanup);
      console.log(`[GameTableScreen] 📝 Limpeza registrada (total: ${this.#cleanups.length})`);
    }
  }

  /**
   * Define o unsubscriber do listener de monitoramento.
   * @param {Function} unsubscribe - Função para parar o monitoramento
   */
  setMonitoringUnsubscribe(unsubscribe) {
    if (typeof unsubscribe === 'function') {
      this.#monitoringUnsubscribe = unsubscribe;
      console.log(`[GameTableScreen] 📡 Unsubscriber de monitoramento registrado`);
    }
  }

  /**
   * Obtém UID do usuário logado atualmente.
   * @private
   * @returns {string}
   */
  #getCurrentUserUid() {
    const authService = AuthService.getInstance();
    const currentUser = authService?.getCurrentUser?.();
    return currentUser?.uid || 'user_unknown';
  }

  /**
   * Gera jogadores mock para testes na fase 2.
   * @private
   * @returns {Promise<Object[]>}
   */
  async #generateMockPlayers() {
    const baseTime = Date.now();
    
    // Determina quantidade de jogadores conforme roomType
    const roomTypeMatch = this.#roomType.match(/^(\d+)p$/);
    const playersCount = roomTypeMatch ? parseInt(roomTypeMatch[1], 10) : 2;

    const mockPlayers = [
      {
        uid: this.#myUid,
        name: 'Você',
        avatarUrl: null,
        joinedAt: baseTime
      }
    ];

    // Adiciona outros jogadores
    for (let i = 1; i < playersCount; i++) {
      mockPlayers.push({
        uid: `user_mock_${i}`,
        name: `Jogador ${i}`,
        avatarUrl: null,
        joinedAt: baseTime + (i * 1000)
      });
    }

    console.log(`[GameTableScreen] Gerados ${mockPlayers.length} jogadores mock para ${this.#roomType}`);
    return mockPlayers;
  }
}
