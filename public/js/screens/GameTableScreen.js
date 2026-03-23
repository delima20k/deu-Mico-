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
import { ShuffleController }   from '../services/ShuffleController.js';
import { AuthService } from '../services/AuthService.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { buildAndShuffleDeck, buildDeck } from '../services/deck.js';
import { CardDealAnimator }   from '../components/CardDealAnimator.js';
import { HandModal }          from '../components/HandModal.js';
import { PairsBadge }         from '../components/PairsBadge.js';
import { OpponentPickPanel }  from '../components/OpponentPickPanel.js';
import { CardRevealModal }    from '../components/CardRevealModal.js';
import { flyCardToAvatar, flyCardBetweenAvatars, animatePairArcToButton } from '../utils/CardFlyAnimator.js';
import { AudioService }       from '../services/AudioService.js';
import { FirebaseService }    from '../services/FirebaseService.js';
import { AdService }          from '../services/adService.js';
import { AdConfig }           from '../services/adConfig.js';
import { TournamentService }  from '../services/TournamentService.js';

const CHAT_TRAIL_SPEED_MODE = 'slow';
const CHAT_TRAIL_SPEED_PRESETS = {
  turbo: {
    mineDurationMs: 1500,
    otherDurationMs: 1700,
    popDurationMs: 180,
    gapMs: 30,
  },
  fast: {
    mineDurationMs: 1850,
    otherDurationMs: 2100,
    popDurationMs: 210,
    gapMs: 45,
  },
  slow: {
    mineDurationMs: 3000,
    otherDurationMs: 3400,
    popDurationMs: 280,
    gapMs: 140,
  },
};

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

  /** @type {ShuffleController|null} */
  #shuffleController = null;

  /** @type {import('../domain/Card.js').Card[]|null} Baralho embaralhado da partida */
  #deck = null;

  /** @type {import('../domain/TableLayout.js').TableLayout|null} Layout atual da mesa */
  #tableLayout = null;

  /** @type {HTMLElement|null} Elemento DOM do monte de cartas */
  #deckPileEl = null;

  /** @type {HandModal|null} Modal de cartas na mão do jogador */
  #handModal = null;

  /** @type {Map<string, PairsBadge>} uid → PairsBadge do jogador */
  #pairsBadges = new Map();

  /** @type {Function|null} Unsubscriber do listener de estado de jogo (Firebase) */

  #gameStateUnsub = null;

  /** @type {Function|null} Unsubscriber do canal de eventos de animação (Firebase push) */
  #animEventsUnsub = null;

  /** @type {boolean} Flag: app está em segundo plano (PWA minimizado / aba oculta) */
  #isInBackground = false;

  /** @type {Function|null} Cleanup do handler de visibilitychange */
  #visibilityHandler = null;

  /** @type {Function|null} Cleanup dos listeners de orientação da tela */
  #orientationHandlerCleanup = null;

  /** @type {'portrait'|'landscape'|null} Última orientação aplicada ao container */
  #currentOrientationMode = null;

  /** @type {Set<string>} UIDs de jogadores que enviaram player_left intencional (evita modal duplicado) */
  #receivedPlayerLeftEvents = new Set();

  /** @type {Set<string>} Chaves já notificadas em modal de saída de jogador */
  #notifiedPlayerLeftKeys = new Set();

  /** @type {number} Timestamp do último evento de estado de jogo processado */
  #lastGameEventTs = 0;

  /** @type {number} Último turnOffset de turn_start processado (dedup imune a clock drift) */
  #lastTurnOffset = 0;

  /** @type {boolean} Trava para evitar processamento duplo de eventos */
  #gameStateLock = false;

  /** @type {Function|null} Unsubscriber do monitor de presença */
  #presenceUnsub = null;

  /** @type {Set<string>|null} UIDs dos jogadores no snapshot anterior */
  #prevPlayerUids = null;

  /** @type {Object} Mapa uid->dados do último snapshot de presença */
  #presenceMap = {};

  /** @type {number|null} Timer de saída automática por abandono */
  #autoExitTimer = null;

  /** @type {number} Quantidade de jogadores presentes no momento */
  #activePlayers = 0;

  /** @type {TournamentService} */
  #tournamentService;

  /** @type {string|null} */
  #tournamentInstanceId = null;

  /** @type {string|null} */
  #tournamentId = null;

  /** @type {string|null} */
  #tournamentResultHandledForMatchId = null;

  /** @type {string|null} */
  #generalRankingReportedForMatchId = null;

  /** @type {ReturnType<typeof setTimeout>|null} */
  #tournamentRedirectTimer = null;

  /** @type {Function|null} */
  #tournamentAdBenefitsMapUnsub = null;

  /** @type {Function|null} */
  #tournamentMyBenefitsUnsub = null;

  /** @type {Object} */
  #tournamentAdBenefitsMap = {};

  /** @type {Object|null} */
  #myTournamentBenefits = null;

  /** @type {HTMLElement|null} */
  #tournamentBenefitsPanelEl = null;

  /** @type {HTMLButtonElement|null} */
  #watchBenefitsBtnEl = null;

  /** @type {HTMLButtonElement|null} */
  #revealMicoBtnEl = null;

  /** @type {HTMLElement|null} */
  #benefitsHintEl = null;

  // ── Gerenciamento de turnos ────────────────────────────────────────

  /** @type {Map<string, import('../domain/Card.js').Card[]>} uid → cartas na mão */
  #handMap = new Map();

  /** @type {import('../domain/PlayerSeat.js').PlayerSeat[]} Assentos em ordem horária */
  #turnSeats = [];

  /** @type {number} Índice do dealer em #turnSeats */
  #dealerSeatIdx = 0;

  /** @type {number} Offset de turno a partir do dealer (1 = primeiro roubo) */
  #turnOffset = 1;

  /** @type {OpponentPickPanel|null} Painel de escolha de carta do oponente */
  #opponentPickPanel = null;

  /** @type {Function|null} Unsubscriber do chat realtime */
  #chatUnsubscribe = null;

  /** @type {HTMLElement|null} Camada de animação de mensagens na mesa */
  #chatTrailLayerEl = null;

  /** @type {Array<{uid?: string, name?: string, text?: string, type?: string, avatarUrl?: string, url?: string, fallbackAudioDataUrl?: string, durationMs?: number}>} Fila de mensagens para animação */
  #chatTrailQueue = [];

  /** @type {boolean} Indica se animação de trilha está em execução */
  #chatTrailRunning = false;

  /** @type {Function|null} Limpeza do indicador visual no avatar-alvo do turno */
  #stealHintCleanup = null;

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    super('GameTableScreen');
    this.#screenManager = screenManager;
    this.#tournamentService = TournamentService.getInstance();
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
    // Guarda de segurança: exige matchId real fornecido via NavigationService.toGameTable().
    // Sem ele, o usuário pode ter chegado aqui por hash stale (#game-table na URL)
    // ou por navegação direta sem partida ativa — redireciona para Home.
    if (!params.matchId) {
      console.warn('[GameTableScreen] ⚠️ Acesso sem matchId válido — redirecionando para HomeScreen');
      this.#screenManager.show('HomeScreen');
      return;
    }

    this.#matchId = params.matchId;
    this.#roomType = params.roomType || '2p';
    this.#myUid   = params.myUid   || this.#getCurrentUserUid();
    this.#players = params.players || await this.#generateMockPlayers();
    this.#tournamentInstanceId = params.tournamentInstanceId || null;
    this.#tournamentId = params.tournamentId || null;
    this.#tournamentResultHandledForMatchId = null;
    this.#generalRankingReportedForMatchId = null;
    this.#tournamentAdBenefitsMap = {};
    this.#myTournamentBenefits = null;

    if (this.#tournamentRedirectTimer !== null) {
      clearTimeout(this.#tournamentRedirectTimer);
      this.#tournamentRedirectTimer = null;
    }

    // Libera lock global para permitir adaptação automática portrait/landscape.
    this.#unlockOrientation();

    // Re-escreve a própria presença (aguarda) para garantir que o monitor
    // de presença captura snapshot completo com todos os jogadores
    await this.#writeOwnPresence();
    FirebaseService.getInstance().startHeartbeat(this.#matchId, this.#myUid);
    await this.#renderTable();

    // Aplica classe de orientação e mantém sincronizado em tempo real.
    this.#setupOrientationHandler();
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

    // ── Mesa hexagonal ──
    const tableRoot = Dom.create('div', { classes: 'game-table-root' });
    this.#hexTable  = new HexTable();
    const hexEl     = this.#hexTable.create();

    // Gera layout com TableLayoutService e coloca no slot do hexágono
    try {
      const tableLayout = this.#createTableLayout();

      this.#tableLayout = tableLayout;
      this.#gameTableView = new GameTableView(tableLayout, this.#myUid, this.#roomType);
      const tableEl = this.#gameTableView.create();

      // Insere o conteúdo do jogo dentro do slot do hexágono
      this.#hexTable.getSlot().append(tableEl);

      // Insere o container de players DIRETAMENTE no hex-table (fora do inner)
      // para escapar do stacking context criado por transform: scale(0.88)
      const playersContainerEl = this.#gameTableView.getPlayersContainer();
      if (playersContainerEl) {
        hexEl.append(playersContainerEl);

        // Cria PairsBadge para cada jogador (sobrepostos ao seu player-badge)
        this.#pairsBadges.clear();
        for (const seat of tableLayout.seats) {
          const playerEl = playersContainerEl.querySelector(`[data-uid="${seat.uid}"]`);
          if (playerEl) {
            const pb = new PairsBadge(playerEl, seat.uid, seat.uid === this.#myUid);
            this.#pairsBadges.set(seat.uid, pb);
          }
        }
      }

      // Camada dedicada para mensagens voando de baixo para cima na mesa
      const chatTrailLayer = Dom.create('div', { classes: 'game-table-chat-trail' });
      hexEl.append(chatTrailLayer);
      this.#chatTrailLayerEl = chatTrailLayer;

      // ── Monte de cartas + painel de ação (wrapper centralizado) ──
      const deckStack = Dom.create('div', { classes: 'deck-center-stack' });

      // Constrói o baralho real embaralhado (69 cartas)
      this.#deck = buildAndShuffleDeck();

      this.#deckPile   = new CardDeckPile(tableEl);
      this.#deckPileEl = this.#deckPile.create();
      deckStack.append(this.#deckPileEl);

      // Conecta o subárvore ao DOM ANTES de animar para que getBoundingClientRect() funcione
      tableEl.append(deckStack);
      tableRoot.append(hexEl);
      mainEl.append(tableRoot);
      container.append(mainEl);

      // Assina os canais de estado ANTES da animação de entrada do baralho (~2,6 s).
      // O Firebase RTDB entrega apenas o valor atual (onValue), não um histórico:
      // se a animação demorar mais que o tempo até o dealer distribuir as cartas,
      // outros clientes receberiam apenas o turn_start e perderiam o evento dealing.
      // A assinatura antecipada garante que o listener está ativo desde o início.
      this.#subscribeGameState();
      this.#subscribeAnimEvents();

      // Sincroniza contagem visual e distribui cartas com animação
      // O som começa junto com a primeira carta voando
      AudioService.getInstance().playForce('table-open');
      await this.#deckPile.renderCentralDeck(this.#deck);

      // Primeiro a entrar na sala é o dealer (embaralha e entrega)
      const dealerResult = DealerSelectionService.getInstance().resolveFirstJoiner(this.#players);
      const youngestPlayer = dealerResult.youngestPlayer;

      // Anúncio: rewarded opcional para o dealer (primeiro jogador) — não bloqueia
      DealerSelectionService.getInstance()
        .offerFirstPlayerReward(youngestPlayer.id, this.#myUid)
        .catch(() => {});

      this.#deckActionPanel = new DeckActionPanel(
        this.#myUid,
        youngestPlayer.id,
        () => this.#onShuffleRequested(),
        youngestPlayer.name,
        () => this.#onDealRequested()
      );
      deckStack.append(this.#deckActionPanel.create());

      // ShuffleController orquestra autorização, animação e transição de estado
      this.#shuffleController = new ShuffleController({
        deckPile:       this.#deckPile,
        actionPanel:    this.#deckActionPanel,
        myUid:          this.#myUid,
        youngestPlayer,
      });

    } catch (error) {
      console.error('[GameTableScreen] ❌ Erro ao criar layout:', error);
      const errorEl = Dom.create('div', {
        classes: 'game-table-screen__error',
        text: `Erro ao criar mesa: ${error.message}`
      });
      this.#hexTable.getSlot().append(errorEl);
    }

    // Garante que o hexEl/tableRoot estão no DOM mesmo se try falhou antes dos appends
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

      if (this.#isTournamentBenefitsEligible()) {
        this.#tournamentBenefitsPanelEl = Dom.create('section', {
          classes: 'game-table-screen__benefits-panel',
        });

        this.#watchBenefitsBtnEl = Dom.create('button', {
          classes: 'game-table-screen__btn-benefits-watch',
          text: '🎬 Assistir video (beneficios)',
          attrs: { type: 'button' },
        });
        this.#watchBenefitsBtnEl.addEventListener('click', () => {
          void this.#onWatchTournamentBenefits();
        });

        this.#revealMicoBtnEl = Dom.create('button', {
          classes: 'game-table-screen__btn-reveal-mico',
          text: '🎯 Ver quem esta com o mico',
          attrs: { type: 'button' },
        });
        this.#revealMicoBtnEl.addEventListener('click', () => {
          void this.#onRevealMicoBenefitRequested();
        });

        this.#benefitsHintEl = Dom.create('p', {
          classes: 'game-table-screen__benefits-hint',
          text: 'Beneficios de campeonato para partidas com 3+ jogadores.',
        });

        this.#tournamentBenefitsPanelEl.append(
          this.#watchBenefitsBtnEl,
          this.#revealMicoBtnEl,
          this.#benefitsHintEl,
        );
        mainEl.append(this.#tournamentBenefitsPanelEl);
      }
    }

    container.append(mainEl);

    // Inicia monitor de presença para detectar quando alguém sai
    this.#startPresenceMonitor();

    // Assina apenas se o try block lançou antes de alcançar a assinatura antecipada
    if (!this.#gameStateUnsub) this.#subscribeGameState();
    if (!this.#animEventsUnsub) this.#subscribeAnimEvents();

    // Benefícios rewarded de campeonato (sincronizados por partida/uid)
    this.#subscribeTournamentAdBenefits();
    this.#refreshTournamentBenefitsUI();

    // Proteção de segundo plano: não remove jogador ao minimizar o PWA
    this.#setupVisibilityHandler();
  }

  /**
   * Dispara a animação de arco do par até o botão de pares e,
   * ao pousar, chama addPair + shake + sons.
   * @param {string} uid
   * @param {import('../domain/Card.js').Card[]} pair
   * @param {boolean} isOwn  true = é o próprio jogador local
   * @private
   */
  #triggerPairArc(uid, pair, isOwn) {
    const pb = this.#pairsBadges.get(uid);
    if (!pb) return;
    const fromEl = pb.getPlayerEl();
    const toEl   = pb.getElement();

    const onLand = () => {
      pb.addPair(pair);
      if (isOwn) AudioService.getInstance().playForce('pair-own');
      AudioService.getInstance().playForce('pair-gold');
    };

    if (!fromEl || !toEl || pair.length < 2) {
      // Fallback sem animação visual
      onLand();
      return;
    }

    animatePairArcToButton(pair, fromEl, toEl, onLand);
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

    const tableLayout = layoutService.createLayout(
      this.#players,
      this.#myUid,
      playersCount
    );

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
    try {
      // 1. Determina tipo da sala pela quantidade de jogadores
      const playersCount = playerIds.length;
      if (playersCount < 2 || playersCount > 6) {
        throw new Error(`Quantidade inválida de jogadores: ${playersCount}`);
      }
      const roomType = `${playersCount}p`;

      // 2. Obtém UID do jogador logado
      const currentUser = await AuthService.getInstance().getCurrentUser();
      if (!currentUser) {
        throw new Error('Usuário não está logado');
      }
      const myUid = currentUser.uid;

      // 3. Valida que jogador logado está na sala
      if (!playerIds.includes(myUid)) {
        throw new Error(`Jogador logado não está na sala: ${myUid}`);
      }

      // 4. Busca dados de cada jogador
      const userRepository = UserRepository.getInstance();
      const players = [];

      for (let idx = 0; idx < playerIds.length; idx++) {
        const uid = playerIds[idx];
        try {
          const userProfile = await userRepository.getProfile(uid);
          if (userProfile) {
            players.push({
              uid,
              name: userProfile.name || 'Jogador Desconhecido',
              avatarUrl: userProfile.avatarUrl || null,
              // joinedAt usa o índice no array — preserva a ordem de entrada na fila
              joinedAt: idx,
            });
          } else {
            // Fallback se não encontrar perfil
            players.push({
              uid,
              name: `Jogador ${uid.slice(0, 8)}`,
              avatarUrl: null,
              joinedAt: idx,
            });
          }
        } catch (error) {
          console.error(`[GameTableScreen.onRoomReady] ❌ Erro ao buscar perfil de ${uid}:`, error);
          players.push({
            uid,
            name: `Jogador ${uid.slice(0, 8)}`,
            avatarUrl: null,
            joinedAt: idx,
          });
        }
      }

      // 5. Navega para GameTableScreen com parâmetros
      screenManager.show('GameTableScreen', {
        matchId,
        roomType,
        players,
        myUid
      });

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
    // Remove handler de visibilitychange (proteção de segundo plano)
    this.#visibilityHandler?.();
    this.#visibilityHandler = null;
    this.#receivedPlayerLeftEvents.clear();
    this.#notifiedPlayerLeftKeys.clear();

    // Remove listeners de orientação para evitar vazamento ao sair da tela.
    this.#orientationHandlerCleanup?.();
    this.#orientationHandlerCleanup = null;
    this.#currentOrientationMode = null;

    // Fora da mesa, o app volta para portrait quando possível
    this.#lockPortraitOrientation();

    if (this.#tournamentRedirectTimer !== null) {
      clearTimeout(this.#tournamentRedirectTimer);
      this.#tournamentRedirectTimer = null;
    }

    this.#tournamentAdBenefitsMapUnsub?.();
    this.#tournamentAdBenefitsMapUnsub = null;
    this.#tournamentMyBenefitsUnsub?.();
    this.#tournamentMyBenefitsUnsub = null;
    this.#tournamentAdBenefitsMap = {};
    this.#myTournamentBenefits = null;
    this.#tournamentBenefitsPanelEl?.remove();
    this.#tournamentBenefitsPanelEl = null;
    this.#watchBenefitsBtnEl = null;
    this.#revealMicoBtnEl = null;
    this.#benefitsHintEl = null;
    document.querySelector('.mico-reveal-modal')?.remove();

    // Para o heartbeat Firebase (ping periódico)
    FirebaseService.getInstance().stopHeartbeat();

    // Esconde banner de resultados (se visível)
    AdService.getInstance().hideBanner(AdConfig.bannerPlacements.results);
    // Cancela saída automática por abandono (se agendada)
    if (this.#autoExitTimer !== null) {
      clearTimeout(this.#autoExitTimer);
      this.#autoExitTimer = null;
    }

    // Para monitor de presença
    this.#presenceUnsub?.();
    this.#presenceUnsub = null;
    this.#prevPlayerUids = null;
    this.#presenceMap = {};

    // Para listener de estado de jogo (Firebase)
    this.#gameStateUnsub?.();
    this.#gameStateUnsub  = null;
    this.#gameStateLock   = false;
    this.#lastGameEventTs = 0;
    this.#lastTurnOffset  = 0;

    // Para canal de eventos de animação (Firebase push)
    this.#animEventsUnsub?.();
    this.#animEventsUnsub = null;

    // Remove indicador de roubo no avatar (se estiver ativo)
    this.#clearStealHint();

    // Para chat realtime da hand modal
    this.#chatUnsubscribe?.();
    this.#chatUnsubscribe = null;
    MatchService.getInstance().stopSubscribingChat(this.#matchId);
    this.#chatTrailQueue = [];
    this.#chatTrailRunning = false;
    this.#chatTrailLayerEl?.remove();
    this.#chatTrailLayerEl = null;

    // Destroi painel de escolha de carta do oponente
    this.#opponentPickPanel?.destroy();
    this.#opponentPickPanel = null;

    // Destroi modal de mão
    this.#handModal?.destroy();
    this.#handModal = null;

    // Destroi todos os PairsBadges
    this.#pairsBadges.forEach(pb => pb.destroy());
    this.#pairsBadges.clear();

    // Limpa monitoramento (listener do GameRoomMonitor)
    if (this.#monitoringUnsubscribe) {
      this.#monitoringUnsubscribe();
      this.#monitoringUnsubscribe = null;
    }

    // Executa todas as funções de limpeza registradas
    if (this.#cleanups.length > 0) {
      this.#cleanups.forEach((cleanup) => {
        try { cleanup(); } catch (error) {
          console.error('[GameTableScreen] Erro na limpeza:', error);
        }
      });
      this.#cleanups = [];
    }

    // Para todos os monitoramentos ativos (segurança)
    const gameRoomMonitor = window.GameRoomMonitor?.getInstance?.();
    if (gameRoomMonitor) {
      gameRoomMonitor.stopAllMonitoring();
    }
  }

  #lockGameOrientation() {
    try {
      if (!screen.orientation?.lock) return;
      screen.orientation.lock('landscape-primary').catch(() => {
        screen.orientation.lock('landscape').catch(() => {});
      });
    } catch (_) {}
  }

  #unlockOrientation() {
    try {
      if (!screen.orientation?.unlock) return;
      screen.orientation.unlock();
    } catch (_) {}
  }

  #lockPortraitOrientation() {
    try {
      if (!screen.orientation?.lock) return;
      screen.orientation.lock('portrait').catch(() => {});
    } catch (_) {}
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

    // Pré-popula apenas o mapa de nomes (para exibição em notificações).
    // NÃO pré-populamos #prevPlayerUids com this.#players:
    // o primeiro callback do Firebase estabelece o baseline real.
    // Pré-popular causaria falso-positivo "player left" quando o snapshot
    // chega ANTES de todos os jogadores re-escreverem presença após a
    // transição MatchRoomScreen → GameTableScreen (race condition clássica:
    // Firebase SDK pode descartar cache local ao substituir o listener).
    this.#presenceMap = {};
    for (const p of this.#players) {
      this.#presenceMap[p.uid] = p;
    }
    this.#prevPlayerUids = new Set(); // será populado pelo 1º snapshot do Firebase

    this.#presenceUnsub = MatchService.getInstance().subscribePresence(
      this.#matchId,
      (players) => {
        // Mantém mapa de nomes atualizado (inclui entradas mais recentes do Firebase)
        for (const p of players) {
          if (p.uid && p.name) this.#presenceMap[p.uid] = p;
        }

        const currentUids = new Set(players.map(p => p.uid));
        this.#activePlayers = currentUids.size;

        // Detecta quem saiu comparando com snapshot anterior
        for (const uid of this.#prevPlayerUids) {
          if (!currentUids.has(uid) && uid !== this.#myUid) {
            const saved = this.#presenceMap[uid]
              || this.#players.find(p => p.uid === uid);
            const name = saved?.name || 'Jogador';
            // isWinner: havia só 2 no snapshot anterior → o restante é o vencedor
            const isWinner = this.#prevPlayerUids.size === 2;
            const isGameOver = isWinner || currentUids.size < 2;

            if (isGameOver) {
              // Fim de partida → sempre exibir modal (countdown + auto-exit)
              this.#notifyPlayerLeft(uid, name, isWinner);
            } else {
              // Aguarda 1.5s para o evento player_left chegar via animEvents.
              // Se chegar antes (saída intencional), o toast já foi exibido
              // e o modal não precisa ser mostrado.
              const capturedUid  = uid;
              const capturedName = name;
              setTimeout(() => {
                if (!this.#receivedPlayerLeftEvents.has(capturedUid)) {
                  this.#notifyPlayerLeft(capturedUid, capturedName, false);
                }
              }, 1500);
            }

            // Se restaram menos de 2 jogadores, força saída em 10s
            if (currentUids.size < 2) {
              this.#scheduleAutoExit();
            }
          }
        }

        this.#prevPlayerUids = currentUids;
      }
    );
  }

  /**
   * Agenda saída automática em 10s quando a partida não tem jogadores suficientes.
   * @private
   */
  #scheduleAutoExit() {
    if (this.#autoExitTimer !== null) return; // já agendado
    console.warn('[GameTableScreen] Menos de 2 jogadores — saída automática em 10s');
    this.#autoExitTimer = setTimeout(() => {
      this.#autoExitTimer = null;
      console.warn('[GameTableScreen] Saída automática executada');
      this.#onExitGame();
    }, 10_000);
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
    const needsForceExit = isWinner || this.#activePlayers < 2;

    // Sanitiza o nome para evitar XSS — nome vem de outro cliente via Firebase
    const safeName = String(name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    if (isWinner) {
      msg.innerHTML = `<strong>${safeName}</strong> saiu da partida.<br>Você é o <strong>vencedor</strong>! 🎉`;
    } else if (needsForceExit) {
      msg.innerHTML = `<strong>${safeName}</strong> saiu da partida.<br>Partida encerrada. Saindo em <strong id="exit-countdown">10</strong>s…`;
    } else {
      msg.innerHTML = `<strong>${safeName}</strong> saiu da partida.`;
    }

    const btnClose = Dom.create('button', {
      classes: 'game-exit-notification__close',
      text: needsForceExit ? 'Sair agora' : 'OK',
      attrs: { type: 'button' },
    });
    btnClose.addEventListener('click', () => {
      overlay.remove();
      if (needsForceExit) {
        clearTimeout(this.#autoExitTimer);
        this.#autoExitTimer = null;
        this.#onExitGame();
      }
    });

    bubble.append(icon, msg, btnClose);
    overlay.append(bubble);
    container.append(overlay);

    // Countdown visual para forceExit
    if (needsForceExit && !isWinner) {
      let secs = 10;
      const countEl = overlay.querySelector('#exit-countdown');
      const tick = setInterval(() => {
        secs--;
        if (countEl) countEl.textContent = String(secs);
        if (secs <= 0) clearInterval(tick);
      }, 1000);
    }

    // Auto-fecha depois de 8s se não for saída forçada
    if (!needsForceExit) {
      setTimeout(() => overlay.isConnected && overlay.remove(), 8000);
    }
  }

  /**
   * Exibe modal de saída de jogador sem repetir para a mesma chave.
   * @param {string} playerKey - UID (ou fallback) para deduplicação
   * @param {string} name - Nome exibido no modal
   * @param {boolean} [isWinner=false] - true quando a saída encerra a partida com vencedor
   * @private
   */
  #notifyPlayerLeft(playerKey, name, isWinner = false) {
    if (!playerKey) return;
    if (this.#notifiedPlayerLeftKeys.has(playerKey)) return;
    this.#notifiedPlayerLeftKeys.add(playerKey);
    this.#showExitNotification(name, isWinner);
  }

  /**
   * Usuário confirmou sair da mesa (via GameExitButton).
   * Remove presença, para listeners e volta para RoomsScreen.
   * @private
   */
  async #onExitGame() {
    console.log(`[GameExit] clicked matchId=${this.#matchId} uid=${this.#myUid?.slice(0, 8)}...`);

    // Notifica os outros jogadores que saímos intencionalmente ANTES de remover presença.
    // Isso permite que eles recebam o toast (player_left) antes do evento de presença,
    // evitando o modal de saída inesperada.
    const myPlayer = this.#players?.find(p => p.uid === this.#myUid);
    if (myPlayer && this.#matchId) {
      await MatchService.getInstance().pushAnimEvent(this.#matchId, {
        type:          'player_left',
        playerName:    myPlayer.name,
        playerUid:     this.#myUid,
        fromClientUid: this.#myUid,
      }).catch(() => {});
    }

    // Marca saída voluntária para evitar redirecionamento automático em TournamentScreen
    if (this.#matchId) {
      this.#tournamentService.recordUserLeftMatch(this.#matchId);
    }

    await MatchService.getInstance()
      .leaveMatch(this.#matchId, this.#myUid)
      .catch(err => console.error('[GameExit] erro no leaveMatch:', err));
    console.log('[GameExit] navigated to RoomsScreen');
    this.#screenManager.show('RoomsScreen');
  }

  /**
   * Handler do botão "EMBARALHAR AS CARTAS".
   * Publica evento no Firebase → todos os clientes recebem e animam simultaneamente.
   * Fallback local se Firebase indisponível.
   * @private
   */
  async #onShuffleRequested() {
    if (this.#activePlayers < 2) {
      this.#deckActionPanel?.showBlockedWarning('Aguardando jogadores para iniciar');
      return;
    }
    if (!this.#shuffleController?.isAuthorized) {
      this.#deckActionPanel?.showBlockedWarning(
        `Somente ${this.#shuffleController?.youngestPlayer?.name} pode embaralhar`
      );
      return;
    }
    if (this.#gameStateLock) return;
    this.#gameStateLock = true;

    try {
      await MatchService.getInstance().writeGameState(this.#matchId, {
        phase: 'shuffling',
        triggeredBy: this.#myUid,
        ts: Date.now(),
      });
      // #handleGameState cuida da animação em todos os clientes
    } catch (err) {
      console.warn('[GameTableScreen] Firebase indisponível — embaralhamento local', err);
      this.#gameStateLock = false;
      this.#deckActionPanel?.setState('shuffling');
      AudioService.getInstance().playLoop('shuffle-start');
      await this.#deckPile?.animateCentralDeckShuffle();
      AudioService.getInstance().stopLoop('shuffle-start');
      this.#deckActionPanel?.setState('readyToDeal');
    }
  }

  /**
   * Handler do botão "ENTREGAR CARTAS".
   * Publica evento no Firebase com a ordem das cartas → todos os clientes recebem e animam.
   * Fallback local se Firebase indisponível.
   * @private
   */
  async #onDealRequested() {
    if (this.#activePlayers < 2) {
      this.#deckActionPanel?.showBlockedWarning('Aguardando jogadores para iniciar');
      return;
    }
    if (!this.#deck || !this.#tableLayout || !this.#deckPileEl) return;
    if (this.#gameStateLock) return;
    this.#gameStateLock = true;

    try {
      await MatchService.getInstance().writeGameState(this.#matchId, {
        phase: 'dealing',
        dealerUid: this.#myUid,
        cardOrder: this.#deck.map(c => c.id),
        ts: Date.now(),
      });
      // #handleGameState cuida da animação em todos os clientes
    } catch (err) {
      console.warn('[GameTableScreen] Firebase indisponível — entregando cartas localmente', err);
      this.#gameStateLock = false;
      this.#runDealAnimation();
    }
  }

  /**
   * Assina o canal de eventos de animação no Firebase (push queue).
   * Cada evento é entregue via onChildAdded — nunca sobrescrito, nunca perdido.
   * @private
   */
  #subscribeAnimEvents() {
    this.#animEventsUnsub?.();
    this.#animEventsUnsub = MatchService.getInstance().subscribeAnimEvents(
      this.#matchId,
      (event) => this.#handleAnimEvent(event)
    );
  }

  /**
   * Processa um evento de animação recebido do canal push do Firebase.
   * Executa apenas animações visuais — sem mudanças de estado do jogo.
   * Ignora eventos gerados pelo próprio cliente (fromClientUid === myUid).
   * @param {Object} event - {eid, type, fromClientUid, ...payload}
   * @private
   */
  #handleAnimEvent(event) {
    if (!event?.type) return;

    // Pula eventos que eu mesmo gerei (já executei a animação localmente)
    if (event.fromClientUid === this.#myUid) return;

    if (event.type === 'card_fly') {
      const fromPb = this.#pairsBadges.get(event.fromUid);
      const toPb   = this.#pairsBadges.get(event.toUid);
      if (fromPb && toPb) {
        console.log(`[AnimEvent] 🃏 Carta voando de ${event.fromUid?.slice(0, 8)} → ${event.toUid?.slice(0, 8)}`);
        flyCardBetweenAvatars(fromPb.getPlayerEl(), toPb.getPlayerEl(), 'img/carta_verso.png', () => {
          AudioService.getInstance().playForce('card-fly-land');
        });
      }
    }

    if (event.type === 'pair_formed') {
      const badge = this.#pairsBadges.get(event.uid);
      if (badge && Array.isArray(event.cardIds)) {
        const deckForLookup = this.#deck ?? [];
        const cardMap = new Map(deckForLookup.map(c => [c.id, c]));
        const pair = event.cardIds.map(id => cardMap.get(id)).filter(Boolean);
        console.log(`[AnimEvent] 🎯 Par animado de ${event.uid?.slice(0, 8)}: ${pair.map(c => c?.name).join(' + ')}`);
        this.#triggerPairArc(event.uid, pair, false);
      }
    }

    if (event.type === 'player_left') {
      // Registra UID como saída intencional para o monitor de presença
      // não exibir o modal de saída inesperada redundante.
      if (event.playerUid) this.#receivedPlayerLeftEvents.add(event.playerUid);
      const playerName = event.playerName || 'Jogador';
      const playerKey = event.playerUid || `player-left:${playerName.toLowerCase()}`;
      this.#notifyPlayerLeft(playerKey, playerName, false);
    }
  }

  /**
   * Detecta orientação atual e sincroniza classes no container da GameTable.
   * Mantém o layout responsivo por classe para portrait/landscape em tempo real.
   * @private
   */
  #setupOrientationHandler() {
    this.#orientationHandlerCleanup?.();
    this.#orientationHandlerCleanup = null;

    const mql = window.matchMedia('(orientation: landscape)');
    const apply = () => this.#applyOrientationClass(mql.matches ? 'landscape' : 'portrait');

    const onResize = () => apply();
    window.addEventListener('resize', onResize, { passive: true });

    const onMqlChange = () => apply();
    if (mql.addEventListener) {
      mql.addEventListener('change', onMqlChange);
    } else if (mql.addListener) {
      mql.addListener(onMqlChange);
    }

    apply();

    this.#orientationHandlerCleanup = () => {
      window.removeEventListener('resize', onResize);
      if (mql.removeEventListener) {
        mql.removeEventListener('change', onMqlChange);
      } else if (mql.removeListener) {
        mql.removeListener(onMqlChange);
      }
    };
  }

  /**
   * Aplica classes utilitárias de orientação no root da tela.
   * @param {'portrait'|'landscape'} mode
   * @private
   */
  #applyOrientationClass(mode) {
    const container = this.getElement();
    if (!container) return;

    container.classList.remove('game-table--portrait', 'game-table--landscape');
    container.classList.add(mode === 'landscape' ? 'game-table--landscape' : 'game-table--portrait');

    const tableRoot = container.querySelector('.game-table-root');
    if (tableRoot) {
      tableRoot.classList.remove('game-table-root--portrait', 'game-table-root--landscape');
      tableRoot.classList.add(mode === 'landscape' ? 'game-table-root--landscape' : 'game-table-root--portrait');
    }

    if (this.#currentOrientationMode !== mode) {
      this.#currentOrientationMode = mode;
      this.#opponentPickPanel?.reposition();
    }
  }

  /**
   * Assina o canal de estado de jogo no Firebase.
   * Todos os eventos (embaralhar, entregar) chegam por aqui em TODOS os clientes.
   * @private
   */
  #subscribeGameState() {
    this.#gameStateUnsub?.();

    this.#gameStateUnsub = MatchService.getInstance().subscribeGameState(
      this.#matchId,
      (state) => {
        if (!state?.phase) return;
        if (state.phase === 'turn_start') {
          // Para turn_start usa turnOffset como chave única — imune a clock drift
          // entre clientes diferentes que escrevem com Date.now() local.
          // Usa < (estrito) para permitir re-entrega do mesmo turnOffset após
          // reconexão do Firebase (ex: PWA volta do background com tela bloqueada).
          if (state.turnOffset != null && state.turnOffset < this.#lastTurnOffset) return;
          if (state.turnOffset != null) this.#lastTurnOffset = state.turnOffset;
        } else {
          // Para outros eventos (card_fly, pair_formed, etc.) usa ts — mesma origem
          if (state.ts && state.ts <= this.#lastGameEventTs) return;
        }
        this.#handleGameState(state).catch(err =>
          console.error('[GameTableScreen] Erro em handleGameState:', err)
        );
      }
    );
  }

  /**
   * @returns {boolean}
   * @private
   */
  #isTournamentBenefitsEligible() {
    return this.#roomType === 'tournament' && Array.isArray(this.#players) && this.#players.length >= 3;
  }

  /**
   * Assina estado de benefícios rewarded no Firebase para sincronizar todos os clientes.
   * @private
   */
  #subscribeTournamentAdBenefits() {
    this.#tournamentAdBenefitsMapUnsub?.();
    this.#tournamentAdBenefitsMapUnsub = null;
    this.#tournamentMyBenefitsUnsub?.();
    this.#tournamentMyBenefitsUnsub = null;

    if (!this.#isTournamentBenefitsEligible() || !this.#matchId || !this.#myUid) return;

    const matchService = MatchService.getInstance();

    this.#tournamentAdBenefitsMapUnsub = matchService.subscribeTournamentMatchBenefitsMap(
      this.#matchId,
      (mapData) => {
        this.#tournamentAdBenefitsMap = mapData || {};
        this.#refreshTournamentBenefitsUI();
      },
    );

    this.#tournamentMyBenefitsUnsub = matchService.subscribeTournamentMatchBenefits(
      this.#matchId,
      this.#myUid,
      (benefits) => {
        this.#myTournamentBenefits = benefits || null;
        this.#refreshTournamentBenefitsUI();
      },
    );
  }

  /**
   * @returns {boolean}
   * @private
   */
  #hasCardsBeenDealt() {
    return [...this.#handMap.values()].some((hand) => Array.isArray(hand) && hand.length > 0);
  }

  /**
   * @param {string} text
   * @private
   */
  #setBenefitsHint(text) {
    if (!this.#benefitsHintEl) return;
    this.#benefitsHintEl.textContent = String(text || '');
  }

  /**
   * Atualiza estado visual dos botões de benefício.
   * @private
   */
  #refreshTournamentBenefitsUI() {
    if (!this.#tournamentBenefitsPanelEl) return;

    const eligible = this.#isTournamentBenefitsEligible();
    const canRewarded = eligible && AdConfig.enableRewarded;
    const rewards = this.#myTournamentBenefits?.rewards || {};
    const revealMicoGranted = Boolean(rewards?.revealMico?.grantedAt);
    const revealMicoConsumed = Boolean(rewards?.revealMico?.consumedAt);
    const dealerSkipGranted = Boolean(rewards?.dealerSkipLeft?.grantedAt);
    const dealerSkipConsumed = Boolean(rewards?.dealerSkipLeft?.consumedAt);
    const hasAnyBenefitGranted = revealMicoGranted || dealerSkipGranted;
    const hasStarted = this.#hasCardsBeenDealt();
    const canRevealMicoNow = revealMicoGranted && !revealMicoConsumed && hasStarted;

    if (this.#watchBenefitsBtnEl) {
      this.#watchBenefitsBtnEl.disabled = !canRewarded || hasAnyBenefitGranted;
      this.#watchBenefitsBtnEl.textContent = hasAnyBenefitGranted
        ? '✅ Beneficios ja liberados para esta partida'
        : '🎬 Assistir video (beneficios)';
    }

    if (this.#revealMicoBtnEl) {
      this.#revealMicoBtnEl.style.display = revealMicoGranted ? '' : 'none';
      this.#revealMicoBtnEl.disabled = !canRevealMicoNow;
      this.#revealMicoBtnEl.textContent = revealMicoConsumed
        ? '🎯 Beneficio de revelar mico ja utilizado'
        : '🎯 Ver quem esta com o mico';
    }

    if (!eligible) {
      this.#setBenefitsHint('Beneficios disponiveis apenas em campeonato com 3+ jogadores.');
      return;
    }
    if (!AdConfig.enableRewarded) {
      this.#setBenefitsHint('Rewarded desativado na configuracao atual.');
      return;
    }
    if (!hasAnyBenefitGranted) {
      this.#setBenefitsHint('Assista ao video para desbloquear: revelar mico (1x) e pular 1 jogador na distribuicao se voce for dealer.');
      return;
    }
    if (!hasStarted) {
      this.#setBenefitsHint('Beneficios liberados. O botao de revelar mico aparece apos inicio da partida.');
      return;
    }
    if (revealMicoConsumed) {
      this.#setBenefitsHint('Beneficio de revelar mico ja foi consumido nesta partida.');
      return;
    }
    if (dealerSkipGranted && dealerSkipConsumed) {
      this.#setBenefitsHint('Beneficio de distribuicao do dealer ja foi consumido nesta partida.');
      return;
    }
    this.#setBenefitsHint('Beneficios ativos para esta partida.');
  }

  /**
   * @private
   */
  async #onWatchTournamentBenefits() {
    if (!this.#isTournamentBenefitsEligible() || !this.#matchId || !this.#myUid) {
      this.#setBenefitsHint('Beneficio indisponivel neste contexto.');
      return;
    }

    if (this.#watchBenefitsBtnEl) {
      this.#watchBenefitsBtnEl.disabled = true;
      this.#watchBenefitsBtnEl.textContent = 'Carregando...';
    }

    const result = await AdService.getInstance()
      .showRewarded(AdConfig.rewardedTriggers.tournamentBenefits)
      .catch(() => ({ rewarded: false }));

    if (!result.rewarded) {
      this.#setBenefitsHint('Video nao concluido. Nenhum beneficio liberado.');
      this.#refreshTournamentBenefitsUI();
      return;
    }

    AdService.getInstance().grantReward(AdConfig.rewardTypes.tournamentBenefits);
    AdService.getInstance().grantReward(AdConfig.rewardTypes.revealMico);
    AdService.getInstance().grantReward(AdConfig.rewardTypes.dealerSkipLeft);

    await MatchService.getInstance().grantTournamentMatchBenefits(this.#matchId, this.#myUid, {
      grantRevealMico: true,
      grantDealerSkipLeft: true,
      source: 'game_table_tournament',
    }).catch((error) => {
      console.error('[AdBenefits] Falha ao gravar benefícios no Firebase:', error);
    });

    this.#setBenefitsHint('Beneficios liberados para esta partida.');
    this.#refreshTournamentBenefitsUI();
  }

  /**
   * @private
   */
  async #onRevealMicoBenefitRequested() {
    if (!this.#isTournamentBenefitsEligible() || !this.#matchId || !this.#myUid) {
      this.#setBenefitsHint('Beneficio indisponivel neste contexto.');
      return;
    }

    if (!this.#hasCardsBeenDealt()) {
      this.#setBenefitsHint('Este beneficio fica disponivel apos o inicio da partida.');
      this.#refreshTournamentBenefitsUI();
      return;
    }

    if (this.#revealMicoBtnEl) {
      this.#revealMicoBtnEl.disabled = true;
      this.#revealMicoBtnEl.textContent = 'Processando...';
    }

    const consumeResult = await MatchService.getInstance().consumeTournamentMatchBenefit(
      this.#matchId,
      this.#myUid,
      'revealMico',
      {
        phase: 'match_started',
        reason: 'reveal_mico_button',
      },
    ).catch(() => ({ consumed: false, state: null }));

    if (!consumeResult.consumed) {
      this.#setBenefitsHint('Beneficio de revelar mico ja foi usado ou nao esta ativo.');
      this.#refreshTournamentBenefitsUI();
      return;
    }

    const micoPlayer = this.#findCurrentMicoHolderPlayer();
    if (!micoPlayer) {
      this.#setBenefitsHint('Nao foi possivel identificar quem esta com o mico agora.');
      this.#refreshTournamentBenefitsUI();
      return;
    }

    this.#showMicoHolderModal(micoPlayer);
    this.#setBenefitsHint(`Revelado: ${micoPlayer.name} esta com o mico.`);
    this.#refreshTournamentBenefitsUI();
  }

  /**
   * @returns {{uid:string,name:string,avatarUrl:string}|null}
   * @private
   */
  #findCurrentMicoHolderPlayer() {
    for (const [uid, hand] of this.#handMap.entries()) {
      if (!Array.isArray(hand) || hand.length === 0) continue;
      const hasMico = hand.some((card) => Boolean(card?.isMico));
      if (!hasMico) continue;

      const player = this.#players.find((p) => p.uid === uid);
      return {
        uid,
        name: player?.name || 'Jogador',
        avatarUrl: player?.avatarUrl || '',
      };
    }
    return null;
  }

  /**
   * @param {{uid:string,name:string,avatarUrl:string}} player
   * @private
   */
  #showMicoHolderModal(player) {
    document.querySelector('.mico-reveal-modal')?.remove();

    const overlay = Dom.create('div', { classes: 'mico-reveal-modal' });
    const card = Dom.create('div', { classes: 'mico-reveal-modal__card' });
    const title = Dom.create('h3', {
      classes: 'mico-reveal-modal__title',
      text: 'Quem esta com o mico agora',
    });

    const avatarWrap = Dom.create('div', { classes: 'mico-reveal-modal__avatar-wrap' });
    if (player.avatarUrl) {
      const avatar = Dom.create('img', {
        classes: 'mico-reveal-modal__avatar',
        attrs: {
          src: player.avatarUrl,
          alt: player.name,
          loading: 'lazy',
          referrerpolicy: 'no-referrer',
        },
      });
      avatar.addEventListener('error', () => {
        avatarWrap.innerHTML = '';
        avatarWrap.append(Dom.create('span', {
          classes: 'mico-reveal-modal__avatar-fallback',
          text: (player.name || '?').slice(0, 1).toUpperCase(),
        }));
      });
      avatarWrap.append(avatar);
    } else {
      avatarWrap.append(Dom.create('span', {
        classes: 'mico-reveal-modal__avatar-fallback',
        text: (player.name || '?').slice(0, 1).toUpperCase(),
      }));
    }

    const name = Dom.create('p', {
      classes: 'mico-reveal-modal__name',
      text: player.name,
    });
    const subtitle = Dom.create('p', {
      classes: 'mico-reveal-modal__subtitle',
      text: 'Use com sabedoria. Este beneficio so pode ser usado 1 vez por partida.',
    });
    const btnClose = Dom.create('button', {
      classes: 'mico-reveal-modal__close',
      text: 'OK',
      attrs: { type: 'button' },
    });

    const close = () => {
      overlay.classList.add('mico-reveal-modal--closing');
      setTimeout(() => overlay.remove(), 180);
    };

    btnClose.addEventListener('click', close);
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) close();
    });

    card.append(title, avatarWrap, name, subtitle, btnClose);
    overlay.append(card);
    document.body.append(overlay);
  }

  /**
   * Processa evento de estado de jogo recebido do Firebase.
   * Executado em TODOS os clientes quando o dealer aciona embaralhar ou entregar.
   * @param {{ phase: string, ts: number, cardOrder?: string[] }} state
   * @private
   */
  async #handleGameState(state) {
    if (!state?.phase) return;
    // turn_start usa turnOffset para dedup — não atualiza lastGameEventTs
    // (o ts de turn_start tem +100ms artificial que corromperia o filtro dos eventos seguintes)
    if (state.ts && state.phase !== 'turn_start') this.#lastGameEventTs = state.ts;

    if (state.phase === 'shuffling') {
      this.#deckActionPanel?.setState('shuffling');
      AudioService.getInstance().playLoop('shuffle-start');
      await this.#deckPile?.animateCentralDeckShuffle();
      AudioService.getInstance().stopLoop('shuffle-start');
      this.#deckActionPanel?.setState('readyToDeal');
      this.#gameStateLock = false;
    }

    if (state.phase === 'dealing') {
      // Reconstrói o deck na mesma ordem exata que o dealer usou
      if (Array.isArray(state.cardOrder) && state.cardOrder.length > 0) {
        try {
          const base    = buildDeck();
          const cardMap = new Map(base.map(c => [c.id, c]));
          const rebuilt = state.cardOrder.map(id => cardMap.get(id)).filter(Boolean);
          if (rebuilt.length > 0) this.#deck = rebuilt;
        } catch (err) {
          console.warn('[GameTableScreen] buildDeck falhou ao reconstruir, usando deck local:', err);
        }
      }
      this.#gameStateLock = false;
      this.#runDealAnimation();
    }

    if (state.phase === 'card_picked') {
      // O dono da carta vê ela voar para fora da sua mão imediatamente
      if (state.fromUid === this.#myUid) {
        this.#handModal?.removeCard(state.cardId, true /* stolen */);
      }
    }

    if (state.phase === 'card_fly') {
      // Animação migrada para #handleAnimEvent via canal animEvents (onChildAdded).
      // Mantido no gameState apenas para compatibilidade com versões antigas.
    }

    if (state.phase === 'scroll_sync') {
      // O dono das cartas (targetUid) espelha o scroll que o picker fez no opp-pick-panel
      if (state.targetUid === this.#myUid) {
        this.#handModal?.setScrollRatio(state.ratio);
      }
    }

    if (state.phase === 'pair_formed') {
      // Eco próprio: jogador local já processou tudo localmente — pula visual,
      // mas NÃO faz return para não bloquear fases subsequentes (turn_start).
      if (state.uid !== this.#myUid) {
        // Remove as cartas pareadas do handMap global.
        // Busca em TODAS as mãos para garantir remoção correta independente da
        // ordem de chegada dos eventos (card_stolen pode chegar antes ou depois).
        if (Array.isArray(state.cardIds)) {
          for (const cardId of state.cardIds) {
            for (const hand of this.#handMap.values()) {
              const idx = hand.findIndex(c => c.id === cardId);
              if (idx >= 0) { hand.splice(idx, 1); break; }
            }
          }
        }
        // Animação visual migrada para #handleAnimEvent via canal animEvents (onChildAdded).
      }
    }

    if (state.phase === 'turn_start') {
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      const env = isPWA ? 'PWA' : 'Navegador';
      console.log(`[TURNO] 🎮 Processando turno | meuUid: ${this.#myUid?.slice(0, 8)} | currentPlayer: ${state.activeUid?.slice(0, 8)} | target: ${state.targetUid?.slice(0, 8)} | é minha vez: ${state.activeUid === this.#myUid} | offset: ${state.turnOffset} | ambiente: ${env}`);
      // Sincroniza offset de turno e ativa UI de roubo/observação
      if (state.turnOffset != null) this.#turnOffset = state.turnOffset;
      this.#onTurnStart(state.activeUid, state.targetUid);
      this.#refreshTournamentBenefitsUI();
    }

    if (state.phase === 'card_stolen') {
      // Atualiza handMap em todos os clientes
      const fromHand = this.#handMap.get(state.fromUid);
      if (fromHand) {
        const idx = fromHand.findIndex(c => c.id === state.cardId);
        if (idx >= 0) {
          const [stolen] = fromHand.splice(idx, 1);
          // Adiciona à mão do ladrão somente se:
          //  - não sou eu (já atualizei localmente em #onCardPickedFromOpponent) E
          //  - não é um bot (já atualizou em #handleAiTurn) — previne duplicação
          const toHand = state.toUid !== this.#myUid && !this.#isAiPlayer(state.toUid)
            ? this.#handMap.get(state.toUid)
            : null;
          if (stolen && toHand && !toHand.some(c => c.id === stolen.id)) {
            toHand.push(stolen);
          }
        }
      }
      // Se fui roubado: removeCard já foi chamado via card_picked (no-op seguro se já removido)
      if (state.fromUid === this.#myUid) {
        this.#handModal?.removeCard(state.cardId, true);
      }
    }

    if (state.phase === 'game_over') {
      // Guard: ignora evento stale que chega como primeiro snapshot
      // (pode ocorrer se o Firebase ainda tem um game_over de sessão anterior
      // para este matchId, já que #handMap só é populado após a distribuição).
      const hasDealtCards = [...this.#handMap.values()].some(h => h.length > 0);
      if (!hasDealtCards) {
        console.warn('[GameTableScreen] ⚠️ game_over ignorado — cartas ainda não distribuídas (evento stale ou prematuro)');
        return;
      }
      this.#showGameOverModal(state);
    }
  }

  /**
   * Executa a animação de distribuição de cartas e abre a modal da mão local.
   * Usa this.#deck como fonte (já deve estar na ordem correta).
   * @private
   */
  #runDealAnimation() {
    if (!this.#deck || !this.#tableLayout || !this.#deckPileEl) return;

    // ── 1. Ordena assentos no sentido horário ──────────────────────────────
    const CW = {
      'bottom': 0,
      'bottom-right': 1, 'right': 1,
      'mid-right': 2,
      'upper-right': 3, 'top-right': 3,
      'top': 4,
      'upper-left': 5, 'top-left': 5,
      'left': 6,       'mid-left': 6,
      'bottom-left': 7,
    };

    const sortedSeats = [...this.#tableLayout.seats]
      .sort((a, b) => (CW[a.positionKey] ?? 0) - (CW[b.positionKey] ?? 0));

    const dealerUid = this.#shuffleController?.youngestPlayer?.id;
    const dealerIdx = sortedSeats.findIndex(s => s.uid === dealerUid);

    const dealerBenefits = dealerUid
      ? (this.#tournamentAdBenefitsMap?.[dealerUid] || null)
      : null;
    const dealerSkipLeftGranted = Boolean(dealerBenefits?.rewards?.dealerSkipLeft?.grantedAt);
    const dealerSkipLeftConsumed = Boolean(dealerBenefits?.rewards?.dealerSkipLeft?.consumedAt);
    const shouldSkipLeftOnDeal = this.#isTournamentBenefitsEligible()
      && sortedSeats.length >= 3
      && dealerSkipLeftGranted
      && !dealerSkipLeftConsumed;

    // A distribuição começa pelo jogador imediatamente à ESQUERDA do dealer
    // (sentido anti-horário no mapa CW = índice anterior no array sortedSeats).
    // O dealer recebe por último em cada rodada.
    const dealerStart = dealerIdx >= 0 ? dealerIdx : 0;
    const N = sortedSeats.length;
    const firstDealStep = shouldSkipLeftOnDeal ? 2 : 1;
    const firstReceiverIdx = (dealerStart - firstDealStep + N) % N;

    if (shouldSkipLeftOnDeal) {
      console.log('[AdBenefits] dealer_skip_left ativo: distribuicao iniciada pulando 1 jogador a esquerda');

      if (dealerUid === this.#myUid) {
        void MatchService.getInstance().consumeTournamentMatchBenefit(
          this.#matchId,
          this.#myUid,
          'dealerSkipLeft',
          {
            phase: 'dealing',
            reason: 'dealer_skip_left_applied',
          },
        ).then(({ consumed }) => {
          if (consumed) {
            this.#setBenefitsHint('Beneficio aplicado: distribuicao iniciou pulando 1 jogador a esquerda.');
          }
        }).catch((error) => {
          console.warn('[AdBenefits] Falha ao consumir dealerSkipLeft:', error);
        });
      }
    }

    const dealOrderSeats = [
      ...sortedSeats.slice(firstReceiverIdx),
      ...sortedSeats.slice(0, firstReceiverIdx),
    ];

    // ── 2. Distribui cartas em round-robin ─────────────────────────────────
    // N já declarado acima (sortedSeats.length === dealOrderSeats.length)
    const cardsByUid = new Map(dealOrderSeats.map(s => [s.uid, []]));
    this.#deck.forEach((card, i) => {
      const uid = dealOrderSeats[i % N].uid;
      cardsByUid.get(uid).push(card);
    });
    // Salva estado para gerenciamento de turnos
    this.#turnSeats     = sortedSeats;
    this.#dealerSeatIdx = dealerStart;
    this.#handMap       = cardsByUid;
    this.#turnOffset    = 1;
    const dealSequence = dealOrderSeats.map(s => ({
      uid:   s.uid,
      cards: cardsByUid.get(s.uid),
    }));

    // ── 3. Cria modal de mão para o jogador local ─────────────────────────
    this.#handModal?.destroy();
    this.#handModal = new HandModal();
    this.#handModal.create();

    // Callback de par confirmado → atualiza badge local, handMap e broadcast Firebase
    this.#handModal.onPairFormed = async (pair) => {
      // 1. Remove do handMap local
      const myHand = this.#handMap.get(this.#myUid);
      if (myHand) {
        for (const c of pair) {
          const i = myHand.findIndex(x => x.id === c.id);
          if (i >= 0) myHand.splice(i, 1);
        }
      }

      // 2. Atualiza badge do jogador local imediatamente
      const badge = this.#pairsBadges.get(this.#myUid);
      console.log(`[GameTableScreen] 🃏 Par formado: ${pair.map(c => c.name).join(' + ')}`);
      this.#triggerPairArc(this.#myUid, pair, true);
      await this.#awardTournamentPairPoints(this.#myUid, pair, {
        eventTs: Date.now(),
        isDecisive: this.#isPairDecisiveAfterCurrentState(),
      });
      void badge; // referenciado indiretamente em #triggerPairArc

      // 3. Transmite para todos os clientes via Firebase (estado)
      try {
        await MatchService.getInstance().writeGameState(this.#matchId, {
          phase:   'pair_formed',
          uid:     this.#myUid,
          cardIds: pair.map(c => c.id),
          ts:      Date.now(),
        });
      } catch (err) {
        console.warn('[GameTableScreen] Erro ao enviar par ao Firebase:', err);
      }

      // Push de animação para o canal dedicado (não sobrescrito por eventos seguintes)
      MatchService.getInstance().pushAnimEvent(this.#matchId, {
        type:          'pair_formed',
        uid:           this.#myUid,
        cardIds:       pair.map(c => c.id),
        fromClientUid: this.#myUid,
      }).catch(() => {});
    };

    // ── 4. Bloqueia botão durante a distribuição ───────────────────────────
    this.#deckActionPanel?.setState('dealing');

    // ── 5. Inicia animação de distribuição ────────────────────────────────
    let remaining = this.#deck.length;

    const animator = new CardDealAnimator({
      pileEl:       this.#deckPileEl,
      dealSequence,
      myUid:        this.#myUid,
      onCardLeaving: () => {
        remaining = Math.max(0, remaining - 1);
        this.#deckPile?.updateCentralDeckCount(remaining);
      },
      onCardArrived: (uid, card) => {
        AudioService.getInstance().playForce('deal-start');
        if (uid === this.#myUid) {
          this.#handModal?.addCard(card);
        }
      },
      onDone: () => {
        console.log('[GameTableScreen] ✅ Cartas entregues a todos os jogadores');
        this.#deckActionPanel?.setState('done');
        this.#showChatButton();
        this.#refreshTournamentBenefitsUI();
        this.#initGamePlay(dealerUid);
      },
    });

    animator.start().catch(err => {
      console.error('[GameTableScreen] Erro durante distribuição de cartas:', err);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GAMEPLAY — Mecânica de turnos (roubo de cartas)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Inicializa chat em tempo real dentro da HandModal.
   * Chamado após a distribuição de cartas.
   * @private
   */
  #showChatButton() {
    if (!this.#handModal || !this.#matchId) return;

    this.#chatUnsubscribe?.();
    this.#chatUnsubscribe = null;

    this.#handModal.clearChatMessages();
    this.#handModal.configureChat({
      myUid: this.#myUid,
      players: this.#players,
      onSend: async (text) => {
        return MatchService.getInstance().sendMessage(this.#matchId, text);
      },
      onSendAudio: async (audioPayload) => {
        return MatchService.getInstance().sendAudioMessage(this.#matchId, audioPayload);
      },
    });

    this.#chatTrailQueue = [];
    this.#chatTrailRunning = false;

    this.#chatUnsubscribe = MatchService.getInstance().subscribeChat(
      this.#matchId,
      (message) => {
        this.#handModal?.appendChatMessage(message);
        this.#enqueueChatTrail(message);
      },
    );
  }

  #enqueueChatTrail(message) {
    if (!this.#isChatTrailRenderable(message)) return;

    this.#chatTrailQueue.push({
      ...message,
      isMine: message.uid === this.#myUid,
    });
    if (!this.#chatTrailRunning) {
      void this.#drainChatTrailQueue();
    }
  }

  async #drainChatTrailQueue() {
    this.#chatTrailRunning = true;
    const { gapMs } = this.#getChatTrailSpeed();

    while (this.#chatTrailQueue.length > 0) {
      const nextMessage = this.#chatTrailQueue.shift();
      if (this.#isChatTrailRenderable(nextMessage)) {
        await this.#animateChatTrail(nextMessage);
      }
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }

    this.#chatTrailRunning = false;
  }

  #getChatTrailSpeed() {
    return CHAT_TRAIL_SPEED_PRESETS[CHAT_TRAIL_SPEED_MODE] || CHAT_TRAIL_SPEED_PRESETS.fast;
  }

  #isChatTrailRenderable(message) {
    if (!message) return false;

    if (message.type === 'audio') {
      return Boolean((message.url || message.fallbackAudioDataUrl || '').trim());
    }

    return Boolean((message.text || '').trim());
  }

  #getPlayerNameForChatMessage(message) {
    const fromMessage = (message?.name || '').trim();
    if (fromMessage) return fromMessage;

    const fromPlayers = this.#players.find((player) => player?.uid === message?.uid)?.name || '';
    return (fromPlayers || 'Jogador').trim();
  }

  #getPlayerAvatarForChatMessage(message) {
    const fromMessage = (message?.avatarUrl || '').trim();
    if (fromMessage) return fromMessage;

    const fromPlayers = this.#players.find((player) => player?.uid === message?.uid)?.avatarUrl || '';
    return (fromPlayers || '').trim();
  }

  #getNameInitial(name) {
    const cleaned = (name || '').trim();
    return cleaned ? cleaned[0].toUpperCase() : '?';
  }

  #buildTrailAvatarElement(name, avatarUrl) {
    const avatarEl = Dom.create('div', { classes: 'game-table-chat-trail__avatar' });
    const safeName = name || 'Jogador';

    const fallbackEl = Dom.create('span', {
      classes: 'game-table-chat-trail__avatar-fallback',
      text: this.#getNameInitial(safeName),
      attrs: { 'aria-hidden': 'true' },
    });

    if (!avatarUrl) {
      avatarEl.append(fallbackEl);
      return avatarEl;
    }

    const avatarImg = Dom.create('img', {
      attrs: {
        src: avatarUrl,
        alt: safeName,
        loading: 'lazy',
        referrerpolicy: 'no-referrer',
      },
    });

    avatarImg.addEventListener('error', () => {
      if (!avatarEl.contains(fallbackEl)) {
        avatarEl.innerHTML = '';
        avatarEl.append(fallbackEl);
      }
    });

    avatarEl.append(avatarImg);
    return avatarEl;
  }

  #animateChatTrail(message) {
    return new Promise((resolve) => {
      if (!this.#chatTrailLayerEl) return resolve();

      const layerWidth = this.#chatTrailLayerEl.clientWidth;
      const layerHeight = this.#chatTrailLayerEl.clientHeight;
      const startX = layerWidth / 2;
      const isPortrait = window.matchMedia
        ? window.matchMedia('(orientation: portrait)').matches
        : window.innerHeight >= window.innerWidth;
      const startY = layerHeight / 2;
      const orientationRotate = isPortrait ? ' rotate(-90deg)' : '';
      const endY = -56;
      const endX = -56;

      const isAudio = message.type === 'audio';
      const text = (message.text || '').trim();
      const audioSrc = isAudio ? (message.url || message.fallbackAudioDataUrl || '').trim() : '';
      const playerName = this.#getPlayerNameForChatMessage(message);
      const playerAvatarUrl = this.#getPlayerAvatarForChatMessage(message);

      if (!text && !audioSrc) return resolve();
      const bubble = Dom.create('div', {
        classes: [
          'game-table-chat-trail__msg',
          message.isMine ? 'game-table-chat-trail__msg--me' : 'game-table-chat-trail__msg--other',
          isAudio ? 'game-table-chat-trail__msg--audio' : 'game-table-chat-trail__msg--text',
        ],
      });

      let audioEl = null;
      let fallbackSpeakingTimeout = null;

      if (isAudio && audioSrc) {
        const avatarEl = this.#buildTrailAvatarElement(playerName, playerAvatarUrl);
        const contentEl = Dom.create('div', { classes: 'game-table-chat-trail__content' });
        const nameEl = Dom.create('span', {
          classes: 'game-table-chat-trail__name',
          text: playerName,
        });

        const voiceEl = Dom.create('span', {
          classes: 'game-table-chat-trail__voice',
          attrs: { 'aria-label': `Audio de ${playerName}` },
        });
        const voiceIconEl = Dom.create('span', {
          classes: 'game-table-chat-trail__voice-icon',
          text: '🔊',
          attrs: { 'aria-hidden': 'true' },
        });
        const waveEl = Dom.create('span', { classes: 'game-table-chat-trail__voice-wave' });
        for (let i = 0; i < 3; i++) {
          waveEl.append(Dom.create('span', { classes: 'game-table-chat-trail__voice-wave-bar' }));
        }
        const voiceTextEl = Dom.create('span', {
          classes: 'game-table-chat-trail__voice-text',
          text: 'Audio',
        });

        voiceEl.append(voiceIconEl, waveEl, voiceTextEl);
        contentEl.append(nameEl, voiceEl);
        bubble.append(avatarEl, contentEl);

        audioEl = Dom.create('audio', {
          classes: 'game-table-chat-trail__audio-el',
          attrs: { preload: 'auto', src: audioSrc },
        });

        const setSpeaking = (speaking) => {
          bubble.classList.toggle('game-table-chat-trail__msg--speaking', Boolean(speaking));
        };

        audioEl.addEventListener('play', () => setSpeaking(true));
        audioEl.addEventListener('pause', () => setSpeaking(false));
        audioEl.addEventListener('ended', () => setSpeaking(false));

        bubble.append(audioEl);

        audioEl.play().catch(() => {
          const fallbackDuration = Math.max(900, Math.min(Number(message.durationMs) || 1800, 4200));
          setSpeaking(true);
          fallbackSpeakingTimeout = setTimeout(() => setSpeaking(false), fallbackDuration);
        });
      } else {
        const avatarEl = this.#buildTrailAvatarElement(playerName, playerAvatarUrl);
        const contentEl = Dom.create('div', { classes: 'game-table-chat-trail__content' });
        const nameEl = Dom.create('span', {
          classes: 'game-table-chat-trail__name',
          text: playerName,
        });
        const textEl = Dom.create('span', {
          classes: 'game-table-chat-trail__text',
          text,
        });

        contentEl.append(nameEl, textEl);
        bubble.append(avatarEl, contentEl);
      }

      bubble.style.left = `${startX}px`;
      bubble.style.top = `${startY}px`;
      bubble.style.opacity = '0';
      bubble.style.transform = `translate(-50%, -50%) scale(0.56)${orientationRotate}`;
      this.#chatTrailLayerEl.append(bubble);

      const speed = this.#getChatTrailSpeed();
      const popDuration = speed.popDurationMs || 200;
      const riseDuration = message.isMine ? speed.mineDurationMs : speed.otherDurationMs;
      const totalDuration = popDuration + riseDuration;
      const startTime = performance.now();

      const tick = (now) => {
        const elapsed = now - startTime;
        if (elapsed < popDuration) {
          const popT = Math.min(1, elapsed / popDuration);
          const popEase = 1 - Math.pow(1 - popT, 3);
          const scale = 0.56 + (1 - 0.56) * popEase;
          bubble.style.transform = `translate(-50%, -50%) scale(${scale})${orientationRotate}`;
          bubble.style.opacity = `${0.2 + 0.8 * popEase}`;
          requestAnimationFrame(tick);
          return;
        }

        const riseElapsed = elapsed - popDuration;
        const riseT = Math.min(1, riseElapsed / riseDuration);
        const x = isPortrait
          ? startX + (endX - startX) * riseT
          : startX;
        const y = isPortrait
          ? startY
          : startY + (endY - startY) * riseT;

        bubble.style.left = `${x}px`;
        bubble.style.top = `${y}px`;
        bubble.style.transform = `translate(-50%, -50%) scale(1)${orientationRotate}`;
        bubble.style.opacity = riseT < 0.74 ? '1' : `${Math.max(0, 1 - (riseT - 0.74) / 0.26)}`;

        if (elapsed < totalDuration) {
          requestAnimationFrame(tick);
          return;
        }

        if (fallbackSpeakingTimeout) {
          clearTimeout(fallbackSpeakingTimeout);
          fallbackSpeakingTimeout = null;
        }
        if (audioEl) {
          audioEl.pause();
          audioEl.removeAttribute('src');
          audioEl.load();
        }
        bubble.remove();
        resolve();
      };

      requestAnimationFrame(tick);
    });
  }

  /**
   * Inicializa o fluxo de jogo após a distribuição das cartas.
   * O dealer aguarda 2s e publica o primeiro 'turn_start' no Firebase.
   * @param {string|undefined} dealerUid
   * @private
   */
  #initGamePlay(dealerUid) {
    const N = this.#turnSeats.length;
    if (N < 2) return;

    // Cria (ou recria) o painel de escolha de carta
    this.#opponentPickPanel?.destroy();
    this.#opponentPickPanel = new OpponentPickPanel();

    // Somente o dealer dispara o primeiro turno
    if (dealerUid !== this.#myUid) return;

    setTimeout(async () => {
      // Sentido CCW: o primeiro ativo é o jogador à ESQUERDA do dealer
      // (índice -1 no array sortedSeats/CW) e rouba do jogador à sua DIREITA.
      const activeIdx = ((this.#dealerSeatIdx - this.#turnOffset) % N + N) % N;
      const targetIdx = (activeIdx + 1) % N; // alvo = jogador à direita do ativo
      const activeUid = this.#turnSeats[activeIdx]?.uid;
      const targetUid = this.#turnSeats[targetIdx]?.uid;
      if (!activeUid || !targetUid) {
        console.warn('[GameTableScreen] ⚠️ Não foi possível iniciar primeiro turno — activeUid ou targetUid nulos', { activeIdx, targetIdx, seats: this.#turnSeats.map(s => s?.uid) });
        return;
      }

      try {
        await MatchService.getInstance().writeGameState(this.#matchId, {
          phase: 'turn_start',
          activeUid,
          targetUid,
          turnOffset: this.#turnOffset,
          ts: Date.now(),
        });
      } catch (err) {
        console.warn('[GameTableScreen] Erro ao iniciar primeiro turno:', err);
        // Fallback local
        this.#onTurnStart(activeUid, targetUid);
      }
    }, 2000);
  }

  /**
   * Chamado quando um 'turn_start' chega do Firebase.
   * Se for minha vez: exibe painel de escolha. Caso contrário, mostra toast.
   * @param {string} activeUid  Jogador que vai roubar
   * @param {string} targetUid  Jogador que vai perder uma carta
   * @private
   */
  #onTurnStart(activeUid, targetUid) {
    // Remove qualquer hint anterior e fecha painel de escolha aberto
    this.#clearStealHint();
    this.#opponentPickPanel?.hide();

    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const env = isPWA ? 'PWA' : 'Navegador';
    console.log(`[TURNO] ▶️ onTurnStart | ativo: ${activeUid?.slice(0, 8)} | alvo: ${targetUid?.slice(0, 8)} | é minha vez: ${activeUid === this.#myUid} | ambiente: ${env}`);

    if (activeUid === this.#myUid) {
      // É minha vez — destaca o avatar do alvo e aguarda clique
      this.#showStealHint(targetUid);
    } else {
      // Outro jogador está na vez
      const activePlayer = this.#players.find(p => p.uid === activeUid);
      const activeName   = activePlayer?.name ?? 'Jogador';
      this.#showTurnToast(`Vez de ${activeName}`);

      // Se for jogador bot (mock), simula o turno automaticamente.
      // APENAS o dealer controla bots para evitar execução duplicada entre clientes.
      if (this.#isAiPlayer(activeUid)) {
        const dealerUid = this.#shuffleController?.youngestPlayer?.id;
        if (this.#myUid === dealerUid) {
          this.#handleAiTurn(activeUid, targetUid).catch(err =>
            console.error('[GameTableScreen] Erro no turno bot:', err)
          );
        }
      }
    }
  }

  /**
   * Verifica se um UID pertence a um jogador artificial (mock/bot).
   * @param {string} uid
   * @returns {boolean}
   * @private
   */
  #isAiPlayer(uid) {
    return uid.startsWith('user_mock_');
  }

  /**
   * Simula automaticamente o turno de um jogador bot.
   * Escolhe uma carta aleatória do alvo, atualiza o handMap local,
   * verifica par e chama #broadcastNextTurn para continuar o jogo.
   * @param {string} activeUid  UID do bot que vai roubar
   * @param {string} targetUid  UID do jogador-alvo
   * @private
   */
  async #handleAiTurn(activeUid, targetUid) {
    const targetHand = this.#handMap.get(targetUid) ?? [];
    if (targetHand.length === 0) {
      await this.#broadcastNextTurn();
      return;
    }

    // Delay de "pensamento" do bot (1.0–2.0 s)
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

    // Escolhe carta aleatória do alvo (bots não veem as faces — escolha justa)
    const card = targetHand[Math.floor(Math.random() * targetHand.length)];
    if (!card) { await this.#broadcastNextTurn(); return; }

    // Se o alvo é o jogador local, remove da modal visual imediatamente
    if (targetUid === this.#myUid) {
      this.#handModal?.removeCard(card.id, true /* stolen */);
    }

    // Animação de voo entre avatares (local no dealer)
    const fromPb = this.#pairsBadges.get(targetUid);
    const toPb   = this.#pairsBadges.get(activeUid);
    if (fromPb && toPb) {
      flyCardBetweenAvatars(fromPb.getPlayerEl(), toPb.getPlayerEl(), 'img/carta_verso.png', () => {
        AudioService.getInstance().playForce('card-fly-land');
      });
    }

    // Push de animação de voo para outros clientes verem o bot roubando
    MatchService.getInstance().pushAnimEvent(this.#matchId, {
      type:          'card_fly',
      fromUid:       targetUid,
      toUid:         activeUid,
      fromClientUid: this.#myUid,  // dealer gera; dealer pula via fromClientUid
    }).catch(() => {});

    // Atualiza handMap localmente (remove do alvo, adiciona ao bot)
    const tHand = this.#handMap.get(targetUid) ?? [];
    const tIdx  = tHand.findIndex(c => c.id === card.id);
    if (tIdx >= 0) tHand.splice(tIdx, 1);

    const aHand = this.#handMap.get(activeUid) ?? [];
    aHand.push(card);

    // Verifica par na mão do bot
    const pairCard = card.isMico
      ? null
      : aHand.find(c => c.id !== card.id && c.pairId != null && c.pairId === card.pairId);

    const activeName = this.#players.find(p => p.uid === activeUid)?.name ?? 'Jogador';

    if (pairCard) {
      // Remove o par da mão do bot
      const ai = aHand.findIndex(c => c.id === card.id);
      if (ai >= 0) aHand.splice(ai, 1);
      const pi = aHand.findIndex(c => c.id === pairCard.id);
      if (pi >= 0) aHand.splice(pi, 1);

      // Anima o arc do par até o badge
      this.#triggerPairArc(activeUid, [card, pairCard], false);
      await this.#awardTournamentPairPoints(activeUid, [card, pairCard], {
        eventTs: Date.now(),
        isDecisive: this.#isPairDecisiveAfterCurrentState(),
      });
      this.#showTurnToast(`${activeName} formou um par! 🎉`);

      // Broadcast do par para outros clientes reais
      try {
        await MatchService.getInstance().writeGameState(this.#matchId, {
          phase:   'pair_formed',
          uid:     activeUid,
          cardIds: [card.id, pairCard.id],
          ts:      Date.now(),
        });
      } catch (_e) { /* sem Firebase — badge já atualizado localmente */ }

      // Push de animação de par do bot para todos os outros clientes verem
      MatchService.getInstance().pushAnimEvent(this.#matchId, {
        type:          'pair_formed',
        uid:           activeUid,
        cardIds:       [card.id, pairCard.id],
        fromClientUid: this.#myUid,  // dealer gera; dealer pula via fromClientUid
      }).catch(() => {});

      // Pausa para a animação do par ser visível
      await new Promise(r => setTimeout(r, 900));
    } else {
      if (card.isMico) {
        this.#showTurnToast(`${activeName} pegou o Mico! 😱`);
        AudioService.getInstance().playForce('mico-arrive');
      } else {
        this.#showTurnToast(`${activeName} pegou uma carta`);
      }
      await new Promise(r => setTimeout(r, 800));
    }

    // Avança para o próximo turno
    await this.#broadcastNextTurn();
  }

  /**
   * Adiciona indicador pulsante no avatar do jogador-alvo e registra
   * o listener de clique que abre o painel de escolha de carta.
   * @param {string} targetUid  UID do jogador cujas cartas serão escolhidas
   * @private
   */
  #showStealHint(targetUid) {
    const container = this.#gameTableView?.getPlayersContainer?.();
    if (!container) return;

    const badgeEl = container.querySelector(`[data-uid="${targetUid}"]`);
    if (!badgeEl) return;

    // Adiciona classe de destaque pulsante
    badgeEl.classList.add('player-badge--steal-target');

    const openPanel = () => {
      this.#clearStealHint();
      const targetCards  = this.#handMap.get(targetUid) ?? [];
      const targetPlayer = this.#players.find(p => p.uid === targetUid);
      const targetName   = targetPlayer?.name ?? 'Oponente';
      const avatarUrl    = targetPlayer?.avatarUrl ?? null;

      if (!this.#opponentPickPanel) return;
      this.#opponentPickPanel.show(targetName, targetCards, (card) => {
        this.#onCardPickedFromOpponent(targetUid, card);
      }, avatarUrl);

      // Animação de voo imediata ao clicar: carta sai do avatar do dono e voa ao avatar do ladrão
      this.#opponentPickPanel.onCardClick = (card, _idx, _itemRect) => {
        const fromPb = this.#pairsBadges.get(targetUid);
        const myPb   = this.#pairsBadges.get(this.#myUid);
        if (fromPb && myPb) {
          flyCardBetweenAvatars(fromPb.getPlayerEl(), myPb.getPlayerEl(), 'img/carta_verso.png', () => {
            AudioService.getInstance().playForce('card-fly-land');
          });
        }
        // Som especial ao pegar a carta do mico
        if (card.isMico) {
          AudioService.getInstance().playForce('mico-click');
        }
      };

      // Sincroniza scroll em tempo real: picker arrasta → Firebase → dono das cartas
      let _scrollTs = 0;
      this.#opponentPickPanel.onScrollChange = (ratio) => {
        const now = Date.now();
        if (now - _scrollTs < 50) return; // throttle ≈20 fps
        _scrollTs = now;
        MatchService.getInstance().writeGameState(this.#matchId, {
          phase:     'scroll_sync',
          fromUid:   this.#myUid,
          targetUid,
          ratio,
          ts:        now,
        }).catch(() => {});
      };
    };

    badgeEl.addEventListener('click', openPanel, { once: true });

    // Guarda limpeza para remoção posterior
    this.#stealHintCleanup = () => {
      badgeEl.classList.remove('player-badge--steal-target');
      badgeEl.removeEventListener('click', openPanel);
    };
  }

  /**
   * Remove o indicador visual do avatar-alvo e cancela o listener de clique.
   * @private
   */
  #clearStealHint() {
    this.#stealHintCleanup?.();
    this.#stealHintCleanup = null;
  }

  /**
   * Exibe toast efêmero informando de quem é a vez.
   * @param {string} msg
   * @private
   */
  #showTurnToast(msg) {
    const container = this.getElement();
    container.querySelector('.turn-toast')?.remove();

    const toast = Dom.create('div', { classes: 'turn-toast', text: msg });
    container.append(toast);

    requestAnimationFrame(() =>
      requestAnimationFrame(() => toast.classList.add('turn-toast--visible'))
    );

    setTimeout(() => {
      toast.classList.remove('turn-toast--visible');
      setTimeout(() => toast.isConnected && toast.remove(), 400);
    }, 2500);
  }

  /**
   * Chamado quando o jogador local escolhe uma carta do oponente.
   * Adiciona à mão, verifica par, exibe modal de revelação e avança turno.
   * @param {string} fromUid  UID do oponente roubado
   * @param {import('../domain/Card.js').Card} card  Carta escolhida
   * @private
   */
  #onCardPickedFromOpponent(fromUid, card) {
    // 1. Esconde o painel de escolha
    this.#opponentPickPanel?.hide();

    // 2. Broadcast imediato: dono da carta vê ela sair da mão na hora
    MatchService.getInstance().writeGameState(this.#matchId, {
      phase:   'card_picked',
      fromUid,
      cardId:  card.id,
      ts:      Date.now(),
    }).catch(() => {});

    // 2b. Push de animação de voo para o canal dedicado (onChildAdded — não sobrescrito).
    // Todos os outros clientes veem a carta voar entre avatares em tempo real.
    MatchService.getInstance().pushAnimEvent(this.#matchId, {
      type:          'card_fly',
      fromUid,
      toUid:         this.#myUid,
      fromClientUid: this.#myUid,
    }).catch(() => {});

    // 3. Atualiza handMap local: remove de fromUid, adiciona a myUid
    const fromHand = this.#handMap.get(fromUid) ?? [];
    const cardIdxInMap = fromHand.findIndex(c => c.id === card.id);
    if (cardIdxInMap >= 0) fromHand.splice(cardIdxInMap, 1);

    const myHand = this.#handMap.get(this.#myUid) ?? [];
    myHand.push(card);

    // 3. Adiciona à modal da mão (flip verso→frente no carrossel)
    this.#handModal?.addCard(card);
    // Som ao receber a carta do mico na mão
    if (card.isMico) {
      // Pequeno delay: carta chega ao modal ~1.1s após o clique (duração do voo)
      setTimeout(() => AudioService.getInstance().playForce('mico-arrive'), 1100);
    }

    // 4. Verifica par imediatamente (carta já está em #cards do HandModal)
    const matchCard  = this.#handModal?.findPairFor(card);
    const pairFormed = !!matchCard;

    // 5. Exibe modal de revelação após breve pausa (carta aparece no carrossel)
    setTimeout(() => {
      CardRevealModal.show(card, pairFormed, async () => {
        // ── 6. Broadcast card_stolen PRIMEIRO — garante que outros clientes
        //       movam a carta para a minha mão ANTES de receber pair_formed,
        //       permitindo que o handler pair_formed encontre e remova as
        //       cartas do local correto no handMap.
        try {
          await MatchService.getInstance().writeGameState(this.#matchId, {
            phase:   'card_stolen',
            fromUid,
            toUid:   this.#myUid,
            cardId:  card.id,
            ts:      Date.now(),
          });
        } catch (err) {
          console.warn('[GameTableScreen] Erro ao transmitir roubo:', err);
        }

        // ── 7. Par formado: auto-confirma e transmite DEPOIS do card_stolen ──
        if (matchCard) {
          this.#handModal?.removeCard(card.id);
          this.#handModal?.removeCard(matchCard.id);

          // Remove ambas do handMap local
          const hand = this.#handMap.get(this.#myUid) ?? [];
          for (const id of [card.id, matchCard.id]) {
            const i = hand.findIndex(c => c.id === id);
            if (i >= 0) hand.splice(i, 1);
          }

          // Atualiza badge local
          const badge = this.#pairsBadges.get(this.#myUid);
          void badge; // usado em #triggerPairArc
          this.#triggerPairArc(this.#myUid, [card, matchCard], true);
          await this.#awardTournamentPairPoints(this.#myUid, [card, matchCard], {
            eventTs: Date.now(),
            isDecisive: this.#isPairDecisiveAfterCurrentState(),
          });

          // Broadcast pair_formed (chega DEPOIS que card_stolen já foi processado)
          try {
            await MatchService.getInstance().writeGameState(this.#matchId, {
              phase:   'pair_formed',
              uid:     this.#myUid,
              cardIds: [card.id, matchCard.id],
              ts:      Date.now() + 1,
            });
          } catch (err) {
            console.warn('[GameTableScreen] Erro ao enviar par:', err);
          }

          // Push de animação de par para o canal dedicado (não sobrescrito por turn_start)
          MatchService.getInstance().pushAnimEvent(this.#matchId, {
            type:          'pair_formed',
            uid:           this.#myUid,
            cardIds:       [card.id, matchCard.id],
            fromClientUid: this.#myUid,
          }).catch(() => {});
        }

        // ── 8. Avança para o próximo turno ───────────────────────────
        await this.#broadcastNextTurn();
      });
    }, 350);
  }

  /**
   * Retorna true quando o par atual deixa apenas 1 carta no jogo (mico).
   * @returns {boolean}
   * @private
   */
  #isPairDecisiveAfterCurrentState() {
    const totalCards = [...this.#handMap.values()].reduce((sum, hand) => sum + hand.length, 0);
    return totalCards <= 1;
  }

  /**
   * Atualiza ranking do campeonato quando um par e formado.
   * Regra de pontos (normalizada):
   * - par comum = 100 milli = 0.1 ponto
   * - par decisivo/final = 300 milli = 0.3 ponto
   * @param {string} uid
   * @param {import('../domain/Card.js').Card[]} pair
   * @param {{eventTs?: number, isDecisive?: boolean}} [options]
   * @returns {Promise<void>}
   * @private
   */
  async #awardTournamentPairPoints(uid, pair, options = {}) {
    if (this.#roomType !== 'tournament') return;
    if (!uid || !Array.isArray(pair) || pair.length < 2) return;

    const player = this.#players.find((entry) => entry.uid === uid);

    try {
      await this.#tournamentService.awardPairPoints({
        uid,
        name: player?.name || 'Jogador',
        avatarUrl: player?.avatarUrl || '',
        matchId: this.#matchId,
        cardIds: pair.map((card) => card.id).filter(Boolean),
        eventTs: options.eventTs || Date.now(),
        isDecisive: !!options.isDecisive,
      });

      console.log(
        `[Ranking] par pontuado uid=${uid.slice(0, 8)}... ` +
        `decisive=${!!options.isDecisive} matchId=${this.#matchId}`
      );
    } catch (error) {
      console.error('[Ranking] Falha ao pontuar par no campeonato:', error);
    }
  }

  /**
   * Incrementa o offset de turno e transmite o próximo 'turn_start'.
   * Pula jogadores cujo alvo não tem cartas.
   * @private
   */
  async #broadcastNextTurn() {
    const N = this.#turnSeats.length;
    if (N < 2) return;

    // Verifica se o jogo acabou: total de cartas nas mãos ≤ 1 (só sobrou o mico)
    const totalCards = [...this.#handMap.values()].reduce((sum, h) => sum + h.length, 0);
    if (totalCards <= 1) {
      let micoUid = null;
      for (const [uid, hand] of this.#handMap) {
        if (hand.length > 0) { micoUid = uid; break; }
      }
      // Coleta contagem de pares de cada jogador
      const pairCounts = {};
      for (const [uid, badge] of this.#pairsBadges) {
        pairCounts[uid] = badge.pairCount;
      }
      try {
        await MatchService.getInstance().writeGameState(this.#matchId, {
          phase:      'game_over',
          micoUid,
          pairCounts,
          ts:         Date.now() + 1,
        });
      } catch (err) {
        console.warn('[GameTableScreen] Erro ao transmitir game_over:', err);
        // Fallback local
        this.#showGameOverModal({ micoUid, pairCounts });
      }
      return;
    }

    this.#turnOffset++;

    // Busca próximo par válido (alvo deve ter pelo menos 1 carta)
    for (let tries = 0; tries < N; tries++) {
      // Sentido CCW: cada turnOffset adicional volta uma posição no array CW
      const activeIdx = ((this.#dealerSeatIdx - this.#turnOffset) % N + N) % N;
      const targetIdx = (activeIdx + 1) % N; // alvo = à direita do ativo
      const activeUid = this.#turnSeats[activeIdx]?.uid;
      const targetUid = this.#turnSeats[targetIdx]?.uid;

      if (!activeUid || !targetUid) break;

      const targetCards = this.#handMap.get(targetUid) ?? [];
      if (targetCards.length > 0) {
        try {
          await MatchService.getInstance().writeGameState(this.#matchId, {
            phase: 'turn_start',
            activeUid,
            targetUid,
            turnOffset: this.#turnOffset,
            ts: Date.now() + 100,
          });
        } catch (err) {
          console.warn('[GameTableScreen] Erro ao transmitir próximo turno (fallback local):', err);
          // Fallback local: aciona diretamente sem Firebase
          this.#onTurnStart(activeUid, targetUid);
        }
        return;
      }

      this.#turnOffset++;
    }

    // Nenhum alvo válido encontrado — encerra o jogo
    console.warn('[GameTableScreen] Nenhum alvo com cartas — forçando game_over');
    let micoUid = null;
    for (const [uid, hand] of this.#handMap) {
      if (hand.length > 0) { micoUid = uid; break; }
    }
    const pairCounts = {};
    for (const [uid, badge] of this.#pairsBadges) {
      pairCounts[uid] = badge.pairCount;
    }
    try {
      await MatchService.getInstance().writeGameState(this.#matchId, {
        phase:      'game_over',
        micoUid,
        pairCounts,
        ts:         Date.now() + 1,
      });
    } catch (err) {
      this.#showGameOverModal({ micoUid, pairCounts });
    }
  }

  /**
   * Exibe o modal de resultado final do jogo.
   * Toca sons e exibe classificação completa dos jogadores.
   * @param {{ micoUid: string, pairCounts?: Record<string,number> }} state
   * @private
   */
  #showGameOverModal(state) {
    const { micoUid, pairCounts = {} } = state;

    // Limpa chat da partida
    this.#chatUnsubscribe?.();
    this.#chatUnsubscribe = null;
    MatchService.getInstance().stopSubscribingChat(this.#matchId);
    void MatchService.getInstance().cleanupMatchChatData(this.#matchId);
    this.#handModal?.clearChatMessages();

    // 1. Monta lista de jogadores com seus pares (usa pairCounts do evento
    //    ou fallback para o badge local — garante dado correto em todos os clientes)
    const nonMicoPlayers = this.#players
      .filter(p => p.uid !== micoUid)
      .map(p => ({
        ...p,
        pairs: pairCounts[p.uid] ?? this.#pairsBadges.get(p.uid)?.pairCount ?? 0,
      }))
      .sort((a, b) => b.pairs - a.pairs);

    const micoPlayer = this.#players.find(p => p.uid === micoUid);
    const micoName   = micoPlayer?.name ?? 'Jogador';
    const micoIsMe   = micoUid === this.#myUid;
    const isTournamentMatch = this.#roomType === 'tournament' && !!this.#tournamentInstanceId;
    const winner     = nonMicoPlayers[0] ?? null;
    const others     = nonMicoPlayers.slice(1);

    // 2. Toca sons
    AudioService.getInstance().playForce('game-over');
    if (winner?.uid === this.#myUid) {
      setTimeout(() => {
        AudioService.getInstance().playForce('vitoria-comum');
        setTimeout(() => AudioService.getInstance().playForce('fala-vitaria'), 800);
      }, 700);
    }

    // 3. Remove overlay anterior se existir
    this.getElement().querySelector('.game-over-overlay')?.remove();

    // 4. Constrói o DOM do modal
    const overlay = Dom.create('div', { classes: 'game-over-overlay' });
    const panel   = Dom.create('div', { classes: 'game-over-panel' });

    // ── Header ──────────────────────────────────────────────────────────
    const header = Dom.create('div', { classes: 'game-over-panel__header', text: '🃏 FIM DE JOGO' });
    panel.append(header);

    // ── Card do perdedor (mico) ──────────────────────────────────────────
    const loserCard = Dom.create('div', { classes: 'game-over-card game-over-card--loser' });
    loserCard.innerHTML = `
      <img class="game-over-card__mico-img" src="img/carta_mico.png" alt="Carta Mico" />
      <div class="game-over-card__body">
        <strong class="game-over-card__name">${micoIsMe ? 'Você' : micoName}</strong>
        <span class="game-over-card__label">ficou com o Mico e <strong>PERDEU!</strong> 😢</span>
      </div>
    `;
    panel.append(loserCard);

    // ── Card do vencedor ─────────────────────────────────────────────────
    if (winner) {
      const winnerIsMe = winner.uid === this.#myUid;
      const winnerCard = Dom.create('div', { classes: 'game-over-card game-over-card--winner' });
      winnerCard.innerHTML = `
        <span class="game-over-card__icon">🏆</span>
        <div class="game-over-card__body">
          <strong class="game-over-card__name">${winnerIsMe ? 'Você' : winner.name}</strong>
          <span class="game-over-card__label">ganhou com <strong>${winner.pairs}</strong> par${winner.pairs !== 1 ? 'es' : ''}! 🎉</span>
        </div>
      `;
      panel.append(winnerCard);
    }

    // ── Classificação dos demais (2°, 3°, 4°, 5°) ────────────────────────
    if (others.length > 0) {
      const rankList = Dom.create('div', { classes: 'game-over-rank-list' });
      others.forEach((p, idx) => {
        const place  = idx + 2;
        const isMe   = p.uid === this.#myUid;
        const row    = Dom.create('div', { classes: 'game-over-rank-row' });
        row.innerHTML = `
          <span class="game-over-rank-row__place">${place}°</span>
          <div class="game-over-rank-row__info">
            <strong>${isMe ? 'Você' : p.name}</strong>
            <span>${p.pairs} par${p.pairs !== 1 ? 'es' : ''} · Não foi dessa vez, continue se divertindo! 😊</span>
          </div>
        `;
        rankList.append(row);
      });
      panel.append(rankList);
    }

    // ── Botão rewarded opcional (bônus por assistir anúncio) ────────────
    if (AdConfig.enableRewarded) {
      const btnReward = Dom.create('button', {
        classes: 'game-over-panel__btn game-over-panel__btn--reward',
        text:    '🎁 Assistir anúncio para bônus',
        attrs:   { type: 'button' },
      });
      btnReward.addEventListener('click', async () => {
        btnReward.disabled = true;
        btnReward.textContent = 'Carregando…';
        const result = await AdService.getInstance()
          .showRewarded(AdConfig.rewardedTriggers.gameOverBonus)
          .catch(() => ({ rewarded: false }));
        if (result.rewarded) {
          AdService.getInstance().grantReward(AdConfig.rewardTypes.gameOverBonus);
          btnReward.textContent = '✅ Bônus recebido!';
        } else {
          btnReward.textContent = '🎁 Assistir anúncio para bônus';
          btnReward.disabled = false;
        }
      });
      panel.append(btnReward);
    }

    // ── Banner de anúncio nos resultados ────────────────────────────────
    const adBannerResults = Dom.create('div', {
      classes: 'ad-slot',
      attrs: { id: 'ad-banner-results' },
    });
    panel.append(adBannerResults);
    AdService.getInstance().showBanner(AdConfig.bannerPlacements.results);

    // ── Slot de recompensa para revanche ───────────────────────────
    if (AdConfig.enableRematchReward) {
      const rematchSlot = Dom.create('div', {
        classes: 'reward-slot',
        attrs: { id: 'rewarded-rematch-slot' },
      });
      const rematchBtn = Dom.create('button', {
        classes: 'reward-slot__btn',
        text: '\uD83C\uDFAC Assistir vídeo para bônus de revanche',
        attrs: { type: 'button' },
      });
      rematchBtn.addEventListener('click', async () => {
        rematchBtn.disabled = true;
        rematchBtn.textContent = 'Carregando\u2026';
        const result = await AdService.getInstance()
          .showRewarded(AdConfig.rewardedTriggers.rematchReward)
          .catch(() => ({ rewarded: false }));
        if (result.rewarded) {
          AdService.getInstance().grantReward(AdConfig.rewardTypes.rematchReward);
          rematchBtn.textContent = '\u2705 B\u00f4nus de revanche recebido!';
        } else {
          rematchBtn.textContent = '\uD83C\uDFAC Assistir v\u00eddeo para b\u00f4nus de revanche';
          rematchBtn.disabled = false;
        }
      });
      rematchSlot.append(rematchBtn);
      panel.append(rematchSlot);
    }

    // ── Botão voltar ─────────────────────────────────────────────────────
    const btnBack = Dom.create('button', {
      classes: 'game-over-panel__btn',
      text:    isTournamentMatch ? 'Voltar ao Campeonato' : 'Voltar às Salas',
      attrs:   { type: 'button' },
    });
    btnBack.addEventListener('click', () => {
      if (isTournamentMatch) {
        this.#screenManager.show('TournamentScreen', {
          tournamentInstanceId: this.#tournamentInstanceId,
          tournamentId: this.#tournamentId,
        });
        return;
      }
      this.#onExitGame();
    });
    panel.append(btnBack);

    // Auto-redireciona após 15 s caso o jogador não clique (mais tempo para rewarded)
    const autoExit = setTimeout(() => {
      if (isTournamentMatch) {
        this.#screenManager.show('TournamentScreen', {
          tournamentInstanceId: this.#tournamentInstanceId,
          tournamentId: this.#tournamentId,
        });
        return;
      }
      this.#onExitGame();
    }, 15_000);
    btnBack.addEventListener('click', () => clearTimeout(autoExit), { once: true });

    overlay.append(panel);
    this.getElement().append(overlay);

    // ── Interstitial com delay após exibir resultado ─────────────
    // Anti-duplicação: só exibe 1x por sessão via AdService
    // TODO [AdMob]: Substituir por chamada real ao AdMob via bridge TWA
    setTimeout(() => {
      if (!AdService.getInstance().hasShownInterstitial(AdConfig.interstitialTriggers.afterMatch)) {
        AdService.getInstance()
          .showInterstitial(AdConfig.interstitialTriggers.afterMatch)
          .catch(() => {});
      }
    }, 2000);

    if (isTournamentMatch) {
      void this.#handleTournamentAfterGameOver(state, panel, btnBack);
    } else {
      void this.#reportGeneralRankingAfterGameOver(state);
    }
  }

  /**
   * Atualiza ranking geral (fora de campeonato) com resultado da partida.
   * @param {{ micoUid?: string, pairCounts?: Record<string,number> }} state
   * @returns {Promise<void>}
   * @private
   */
  async #reportGeneralRankingAfterGameOver(state) {
    if (this.#roomType === 'tournament') return;
    if (this.#generalRankingReportedForMatchId === this.#matchId) return;
    this.#generalRankingReportedForMatchId = this.#matchId;

    const me = this.#players.find((p) => p.uid === this.#myUid);
    if (!me?.uid) return;

    const pairsFromState = Number(state?.pairCounts?.[this.#myUid] || 0);
    const pairsFromBadge = Number(this.#pairsBadges.get(this.#myUid)?.pairCount || 0);
    const pairs = Math.max(0, pairsFromState || pairsFromBadge || 0);
    const won = state?.micoUid ? state.micoUid !== this.#myUid : false;

    try {
      await this.#tournamentService.recordGeneralMatchResult({
        uid: me.uid,
        name: me.name || 'Jogador',
        avatarUrl: me.avatarUrl || '',
        matchId: this.#matchId,
        pairs,
        won,
        eventTs: Date.now(),
      });
      console.log(`[Ranking] geral atualizado uid=${me.uid.slice(0, 8)}... matchId=${this.#matchId}`);
    } catch (error) {
      console.error('[Ranking] Falha ao atualizar ranking geral:', error);
    }
  }

  /**
   * Processa avanço da instância de campeonato após game_over.
   * @param {{ micoUid: string, pairCounts?: Record<string,number> }} state
   * @param {HTMLElement} panel
   * @param {HTMLButtonElement} btnBack
   * @returns {Promise<void>}
   * @private
   */
  async #handleTournamentAfterGameOver(state, panel, btnBack) {
    if (!this.#tournamentInstanceId) return;
    if (this.#tournamentResultHandledForMatchId === this.#matchId) return;
    this.#tournamentResultHandledForMatchId = this.#matchId;

    const statusLabel = Dom.create('p', {
      classes: 'game-over-card__label',
      text: 'Processando resultado do campeonato...'
    });
    panel.append(statusLabel);

    let updatedInstance = null;
    try {
      updatedInstance = await this.#tournamentService.reportMatchResult({
        instanceId: this.#tournamentInstanceId,
        matchId: this.#matchId,
        micoUid: state?.micoUid,
        pairCounts: state?.pairCounts || {},
      });
    } catch (error) {
      console.error('[TournamentRound] Falha ao reportar resultado da partida:', error);
      statusLabel.textContent = 'Nao foi possivel processar o resultado do campeonato agora.';
      return;
    }

    if (!updatedInstance) {
      statusLabel.textContent = 'Instancia de campeonato indisponivel.';
      return;
    }

    const eliminated = state?.micoUid === this.#myUid;
    const nextMatchId = updatedInstance.currentMatchId || null;

    if (updatedInstance.status === 'finished') {
      const championUid = updatedInstance.championUid || null;
      const championIsMe = championUid && championUid === this.#myUid;
      statusLabel.textContent = championIsMe
        ? 'Campeonato finalizado. Voce e o campeao!'
        : 'Campeonato finalizado. Confira o resultado da rodada.';
      btnBack.textContent = 'Voltar ao Campeonato';
      return;
    }

    if (eliminated) {
      statusLabel.textContent = 'Voce foi eliminado. Acompanhe a rodada no campeonato.';
      btnBack.textContent = 'Voltar ao Campeonato';
      return;
    }

    const activePlayers = Object.entries(updatedInstance.activePlayers || {})
      .map(([uid, value]) => ({
        uid,
        name: value?.name || 'Jogador',
        avatarUrl: value?.avatarUrl || '',
        joinedAt: Number(value?.joinedAt || Date.now()),
      }))
      .sort((a, b) => Number(a.joinedAt || 0) - Number(b.joinedAt || 0));

    if (!nextMatchId || activePlayers.length < 2) {
      statusLabel.textContent = 'Aguardando definicao da proxima partida...';
      return;
    }

    statusLabel.textContent = 'Voce sobreviveu. Proxima partida iniciando...';

    this.#tournamentRedirectTimer = setTimeout(() => {
      this.#screenManager.show('GameTableScreen', {
        matchId: nextMatchId,
        roomType: 'tournament',
        players: activePlayers,
        myUid: this.#myUid,
        tournamentId: updatedInstance.tournamentId,
        tournamentInstanceId: this.#tournamentInstanceId,
      });
    }, 2600);
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
   * Configura handler de visibilitychange para proteger a sessão do PWA.
   * - Quando vai para segundo plano (hidden): cancela o onDisconnect do Firebase
   *   para que a presença não seja removida automaticamente se a conexão cair.
   * - Quando volta ao primeiro plano (visible): reescreve presença e reinicia heartbeat.
   * @private
   */
  #setupVisibilityHandler() {
    // Remove handler anterior em caso de chamada dupla
    this.#visibilityHandler?.();
    this.#visibilityHandler = null;

    const handler = async () => {
      if (document.hidden) {
        this.#isInBackground = true;
        console.log('[GameTableScreen] 📱 PWA → segundo plano; protegendo presença no Firebase');
        MatchService.getInstance()
          .cancelPresenceOnDisconnect(this.#matchId, this.#myUid)
          .catch(() => {});
      } else {
        this.#isInBackground = false;
        console.log('[GameTableScreen] 📱 PWA → primeiro plano; resincronizando presença');
        // Reinicia heartbeat imediatamente para reconectar mais rápido
        FirebaseService.getInstance().startHeartbeat(this.#matchId, this.#myUid);
        // Reescreve presença (também restaura o onDisconnect handler)
        await this.#writeOwnPresence().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handler);
    this.#visibilityHandler = () => document.removeEventListener('visibilitychange', handler);
  }

  /**
   * Exibe toast efêmero informando que um jogador saiu intencionalmente.
   * Dura 4 segundos e desaparece com fade-out.
   * @param {string} name - Nome do jogador que saiu
   * @private
   */
  #showPlayerLeftToast(name) {
    const container = this.getElement();
    container.querySelector('.player-left-toast')?.remove();

    const toast = Dom.create('div', {
      classes: 'player-left-toast',
      text: `☁️ ${name} saiu do jogo`,
    });
    container.append(toast);

    requestAnimationFrame(() =>
      requestAnimationFrame(() => toast.classList.add('player-left-toast--visible'))
    );

    setTimeout(() => {
      toast.classList.remove('player-left-toast--visible');
      setTimeout(() => toast.isConnected && toast.remove(), 400);
    }, 4000);
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
