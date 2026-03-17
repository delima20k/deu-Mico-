/**
 * @layer screens
 * @group game
 * @role Screen
 * @depends Screen, HeaderBar, LobbyCard, LobbyRepository, MatchmakingService, AuthService
 * @exports RoomsScreen
 *
 * Tela de seleção de filas/salas (2p até 6p + multijogador).
 * Exibe 6 cards com botões para entrar em filas diferentes.
 * Mostra status de presença em tempo real.
 */
import { Screen } from '../core/Screen.js';
import { HeaderBar } from '../components/HeaderBar.js';
import { LobbyCard } from '../components/LobbyCard.js';
import { Dom } from '../utils/Dom.js';
import { MatchmakingService } from '../services/MatchmakingService.js';
import { AuthService } from '../services/AuthService.js';
import { LobbyRepository } from '../repositories/LobbyRepository.js';

export class RoomsScreen extends Screen {
  /** @type {import('../core/ScreenManager.js').ScreenManager} */
  #screenManager;

  /** @type {HeaderBar} */
  #headerBar;

  /** @type {Map<string, LobbyCard>} */
  #cards = new Map();

  /** @type {Map<string, Function>} Unsubscribers de listeners de fila por queueKey */
  #queueUnsubscribers = new Map();

  /** @type {Function|null} DEPRECATED - Polling antigo, será removido */
  #presencePolling = null;

  /** @type {Object[]} Configuração das filas */
  static #QUEUES = [
    { playersCount: 2,    queueKey: 'queue_2p',    lobbyType: '2p'    },
    { playersCount: 3,    queueKey: 'queue_3p',    lobbyType: '3p'    },
    { playersCount: 4,    queueKey: 'queue_4p',    lobbyType: '4p'    },
    { playersCount: 5,    queueKey: 'queue_5p',    lobbyType: '5p'    },
    { playersCount: 6,    queueKey: 'queue_6p',    lobbyType: '6p'    },
    { playersCount: null, queueKey: 'queue_multi', lobbyType: 'multi', label: 'Multijogador' },
  ];

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    super('RoomsScreen');
    this.#screenManager = screenManager;
    this.#headerBar = null;
  }

  /**
   * Cria o template da tela.
   * @returns {HTMLElement}
   */
  _buildTemplate() {
    const wrapper = Dom.create('div', { classes: 'rooms-screen' });
    return wrapper;
  }

  /**
   * Renderiza a tela de salas.
   */
  async onEnter() {
    const container = this.getElement();
    container.innerHTML = '';

    // Header
    this.#headerBar = new HeaderBar();
    const headerEl = this.#headerBar.create();
    container.append(headerEl);

    // Botão para sair da tela de salas
    const btnBack = Dom.create('button', {
      classes: 'rooms-screen__back-btn',
      text: '← Sair',
      attrs: { type: 'button' },
    });
    btnBack.addEventListener('click', () => {
      this.#screenManager.show('MenuScreen');
    });

    // Título
    const title = Dom.create('h1', {
      classes: 'rooms-screen__title',
      text: 'Escolha uma Fila',
    });

    // Container de cards
    const cardsContainer = Dom.create('div', { classes: 'rooms-screen__cards' });

    // Cria cards para cada fila (renderiza imediatamente com count=0)
    RoomsScreen.#QUEUES.forEach(queue => {
      const card = new LobbyCard({
        playersCount: queue.playersCount || 'Multi',
        label:        queue.label || null,
        queueKey:     queue.queueKey,
        presenceCount: 0,
        onJoin: () => this.#onCardJoin(queue.queueKey),
      });

      this.#cards.set(queue.queueKey, card);
      cardsContainer.append(card.create());
    });

    console.log('[RoomsScreen] rendered 6 lobby cards');

    // Container principal
    const mainContainer = Dom.create('main', { classes: 'rooms-screen__main' });
    mainContainer.append(btnBack, title, cardsContainer);

    container.append(mainContainer);

    // Inicia listeners de presença em tempo real (RTDB)
    this.#startQueueListeners();
  }

  /**
   * Limpa ao sair da tela.
   */
  onExit() {
    this.#stopQueueListeners();
    this.#cards.forEach(card => {
      if (card instanceof LobbyCard) {
        // cleanup se necessário
      }
    });
    this.#cards.clear();
  }

  /**
   * Handler: usuário clica em um card para entrar na fila.
   * Mostra "Entrando..." no card (não remove as cards da tela).
   * @private
   */
  async #onCardJoin(queueKey) {
    console.log(`[RoomsScreen] Entrando na fila: ${queueKey}`);

    const queue = RoomsScreen.#QUEUES.find(q => q.queueKey === queueKey);
    const lobbyType = queue?.lobbyType;
    if (!lobbyType) {
      console.error(`[RoomsScreen] Tipo de lobby inválido: ${queueKey}`);
      return;
    }

    // TAREFA C: sinaliza estado visual antes de navegar
    this.#cards.get(queueKey)?.setEntering();

    // Obtém o uid real do usuário autenticado no Firebase
    const currentUser = await AuthService.getInstance().getCurrentUser();
    if (!currentUser?.uid) {
      console.error('[RoomsScreen] Usuário não autenticado');
      return;
    }

    // Entra na fila (fire-and-forget — MatchRoomScreen gerencia assign)
    MatchmakingService.getInstance()
      .enterQueue(lobbyType, currentUser.uid, { name: 'Jogador', avatarUrl: null })
      .catch(err => console.error('[RoomsScreen] Erro ao entrar na fila:', err));

    // Navega para MatchRoomScreen passando lobbyType
    this.#screenManager.show('MatchRoomScreen', { lobbyType });
  }

  /**
   * Inicia listeners em tempo real para todas as filas (RTDB via LobbyRepository).
   * @private
   */
  #startQueueListeners() {
    const lobbyRepo = LobbyRepository.getInstance();

    RoomsScreen.#QUEUES.forEach(queue => {
      const unsubscribe = lobbyRepo.subscribeQueue(
        queue.lobbyType,
        (count) => {
          const card = this.#cards.get(queue.queueKey);
          if (card) {
            card.updateCount(count);
            console.log(`[RoomsScreen] card lobbyType=${queue.lobbyType} updated count=${count}`);
          }
        }
      );

      this.#queueUnsubscribers.set(queue.queueKey, unsubscribe);
    });
  }

  /**
   * Para todos os listeners de filas.
   * @private
   */
  #stopQueueListeners() {
    console.log('[RoomsScreen] Parando todos os listeners de fila...');
    
    this.#queueUnsubscribers.forEach((unsubscribe, queueKey) => {
      try {
        unsubscribe();
        console.log(`[RoomsScreen] Listener parado: ${queueKey}`);
      } catch (error) {
        console.error(`[RoomsScreen] Erro ao parar listener ${queueKey}:`, error);
      }
    });

    this.#queueUnsubscribers.clear();
  }

  /**
   * DEPRECATED - Polling antigo, mantido por compatibilidade.
   * @private
   */
  #startPresencePolling() {
    // Este método está DEPRECADO em favor de #startQueueListeners()
    console.warn('[RoomsScreen] DEPRECATED: #startPresencePolling() não deve mais ser chamado');
  }

  /**
   * DEPRECATED - Para polling antigo.
   * @private
   */
  #stopPresencePolling() {
    if (this.#presencePolling !== null) {
      clearInterval(this.#presencePolling);
      this.#presencePolling = null;
    }
  }
}
