/**
 * @layer screens
 * @group game
 * @role Screen
 * @depends Screen, HeaderBar, ChatBox, PlayersList, QueueStatusBar, MatchService, MatchmakingService, AuthService, NavigationService, TableLayoutService, GameRoomType
 * @exports MatchRoomScreen
 *
 * Tela de sala de partida multijogador.
 * Exibe: lista de jogadores, chat, status da fila, botão sair.
 * Observa players do match e abre GameTableScreen automaticamente quando há 2-6.
 */
import { Screen } from '../core/Screen.js';
import { ChatBox } from '../components/ChatBox.js';
import { PlayersList } from '../components/PlayersList.js';
import { QueueStatusBar } from '../components/QueueStatusBar.js';
import { Dom } from '../utils/Dom.js';
import { MatchService } from '../services/MatchService.js';
import { MatchmakingService } from '../services/MatchmakingService.js';
import { AuthService } from '../services/AuthService.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { NavigationService } from '../services/NavigationService.js';
import { TableLayoutService } from '../services/TableLayoutService.js';
import { GameRoomType } from '../domain/GameRoomType.js';
import { LobbyRepository } from '../repositories/LobbyRepository.js';
import { GameExitButton } from '../components/GameExitButton.js';

export class MatchRoomScreen extends Screen {
  /** @type {import('../core/ScreenManager.js').ScreenManager} */
  #screenManager;

  /** @type {ChatBox} */
  #chatBox;

  /** @type {PlayersList} */
  #playersList;

  /** @type {QueueStatusBar} */
  #queueBar;

  /** @type {string} Tipo do lobby: '2p', '3p', 'multi', 'tournament' */
  #lobbyType = '';

  /** @type {string} matchId real recebido do RTDB assign */
  #matchId = '';

  /** @type {string} */
  #userId = null;

  /** @type {number|null} */
  #presencePolling = null;

  /** @type {Function|null} Unsubscriber do observer de players do match */
  #matchPlayersUnsubscribe = null;

  /** @type {boolean} Flag para evitar navegação duplicada */
  #hasNavigatedToGameTable = false;

  /** @type {Function|null} Unsubscriber do listener de assign no RTDB */
  #assignUnsubscribe = null;

  /** @type {ReturnType<typeof setTimeout>|null} Timeout de 20s aguardando assign */
  #assignTimeoutId = null;

  /** @type {HTMLElement|null} Container raiz resolvido uma vez em onEnter */
  #containerEl = null;

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    super('MatchRoomScreen');
    this.#screenManager = screenManager;
  }

  /**
   * Cria o template da tela.
   * @returns {HTMLElement}
   */
  _buildTemplate() {
    const wrapper = Dom.create('div', { classes: 'match-room-screen' });
    return wrapper;
  }

  /**
   * Renderiza a sala de partida.
   * @param {Object} [params={}]
   * @param {string} [params.lobbyType] - tipo do lobby ('2p', '3p', 'multi', 'tournament') — preferido
   * @param {string} [params.queueKey]  - fallback legado ('queue_2p', etc.)
   */
  async onEnter(params = {}) {
    // 1. Resolve lobbyType (preferência: params.lobbyType; fallback: derivar de queueKey)
    this.#lobbyType = params.lobbyType
      || params.queueKey?.replace('queue_', '')
      || '2p';
    this.#matchId = '';
    this.#hasNavigatedToGameTable = false;

    // 2. Obtém uid real do Firebase Auth
    const authService = AuthService.getInstance();
    const currentUser = await authService.getCurrentUser();

    if (!currentUser || !currentUser.uid) {
      console.error('[MatchRoomScreen] Usuário não autenticado');
      return;
    }
    this.#userId = currentUser.uid;

    // Resolve container uma única vez para toda a vida da tela
    this.#containerEl = this.getElement();
    if (!this.#containerEl) {
      console.error('[MatchRoomScreen] container element não encontrado — abortando onEnter');
      return;
    }
    console.log('[MatchRoomUI] container resolved ok');

    console.log(`[Assign] waiting lobbyType=${this.#lobbyType} uid=${this.#userId}`);

    // 3. Mostra tela de espera enquanto aguarda o assign do RTDB
    this.#renderWaitingState();

    // 4. Timeout de 20s: mostra aviso "Demorou" mas mantém botão cancelar
    this.#assignTimeoutId = setTimeout(() => {
      this.#assignTimeoutId = null;
      if (this.#matchId) return; // já recebeu assign — ignora
      console.warn(`[MatchRoomUI] timeout waiting assign lobbyType=${this.#lobbyType} uid=${this.#userId}`);
      this.#renderWaitingState('timeout');
    }, 20_000);

    // 5. Inscreve-se em tempo real no RTDB — /lobbies/{lobbyType}/assign/{uid}
    this.#assignUnsubscribe?.();
    this.#assignUnsubscribe = LobbyRepository.getInstance()
      .subscribeAssignment(this.#lobbyType, this.#userId, async (assignment) => {
        if (!assignment?.matchId) return;               // sem assign ainda
        if (this.#matchId === assignment.matchId) return; // já processado

        // Rejeita assigns antigos (> 60s) — mantém UI de espera
        const age = Date.now() - (assignment.createdAt || assignment.ts || 0);
        if (age > 60_000) {
          console.warn(`[Assign] stale ignored age=${Math.round(age / 1000)}s lobbyType=${this.#lobbyType} cleared`);
          await LobbyRepository.getInstance()
            .clearAssignment(this.#lobbyType, this.#userId)
            .catch(() => {});
          // Mantém a tela de espera visível — subscribeAssignment segue ativo
          this.#renderWaitingState('searching');
          return;
        }

        // Cancela timeout
        if (this.#assignTimeoutId !== null) {
          clearTimeout(this.#assignTimeoutId);
          this.#assignTimeoutId = null;
        }

        // Para de escutar assign (já temos o matchId)
        this.#assignUnsubscribe?.();
        this.#assignUnsubscribe = null;

        this.#matchId = assignment.matchId;
        console.log(`[Assign] received matchId=${assignment.matchId} lobbyType=${this.#lobbyType}`);

        // Consome o assign do RTDB para evitar reutilização em sessões futuras
        await LobbyRepository.getInstance()
          .clearAssignment(this.#lobbyType, this.#userId)
          .catch(err => console.warn('[Assign] erro ao limpar assign:', err));

        // 6. Inicializa UI completa com o matchId real
        await this.#initWithMatchId();
      });
  }

  /**
   * Renderiza o painel de espera sempre visível.
   * Mostrado imediatamente ao entrar e mantido durante todo o fluxo de assign.
   * @param {'searching'|'timeout'} [mode='searching']
   * @private
   */
  #renderWaitingState(mode = 'searching') {
    const container = this.#containerEl;
    if (!container) return;

    try {
      container.innerHTML = '';

      const wrapper = Dom.create('div', { classes: 'match-room-screen__waiting' });

      // Spinner
      const spinner = Dom.create('div', { classes: 'match-room-screen__spinner' });
      wrapper.append(spinner);

      // Título
      const title = Dom.create('h2', { classes: 'match-room-screen__waiting-title' });
      title.textContent = mode === 'timeout'
        ? 'Demorou, tente novamente'
        : 'Aguardando jogadores...';
      wrapper.append(title);

      // Subtexto
      const sub = Dom.create('p', { classes: 'match-room-screen__waiting-text' });
      sub.textContent = `Sala: ${this.#lobbyType} \u2022 Você já entrou na fila.`;
      wrapper.append(sub);

      // Botão Cancelar — SEMPRE visível
      const btn = Dom.create('button', { classes: 'match-room-screen__cancel-btn' });
      btn.textContent = 'Cancelar';
      btn.addEventListener('click', () => this.#onLeaveRoom());
      wrapper.append(btn);

      container.append(wrapper);
      console.log(`[MatchRoomUI] waiting rendered timedOut=${mode === 'timeout'}`);
    } catch (err) {
      console.error('[MatchRoomUI] #renderWaitingState falhou:', err);
      this.#renderError();
    }
  }

  /**
   * UI mínima de fallback quando um render falha.
   * @private
   */
  #renderError() {
    const container = this.#containerEl;
    if (!container) return;
    try {
      container.innerHTML = '';
      const msg = Dom.create('p', { classes: 'match-room-screen__waiting-text' });
      msg.textContent = 'Erro ao montar tela. Tente voltar.';
      const btn = Dom.create('button', { classes: 'match-room-screen__cancel-btn' });
      btn.textContent = 'Voltar';
      btn.addEventListener('click', () => this.#onLeaveRoom());
      const wrap = Dom.create('div', { classes: 'match-room-screen__waiting' });
      wrap.append(msg, btn);
      container.append(wrap);
    } catch (_) { /* silencia para não entrar em loop */ }
  }

  /**
   * Inicializa a UI completa após receber o matchId real do assign.
   * @private
   */
  async #initWithMatchId() {
    console.log(`[MatchRoom] starting listeners matchId=${this.#matchId}`);

    const container = this.#containerEl;
    if (!container) return;

    try {
      container.innerHTML = '';

      // Botão CORRER — fixo no canto superior esquerdo
      const exitBtn = new GameExitButton({
        onExitRequested: () => this.#onLeaveRoom(),
      });
      container.append(exitBtn.create());

      // Layout principal
      const main = Dom.create('main', { classes: 'match-room-screen__main' });

      // Seção esquerda: Lista de jogadores
      const leftSection = Dom.create('section', { classes: 'match-room-screen__left' });

      this.#playersList = new PlayersList({
        [this.#userId]: { name: 'Você', avatarUrl: null, ready: false },
      });
      leftSection.append(this.#playersList.create());

      // Seção direita: Status e Chat
      const rightSection = Dom.create('section', { classes: 'match-room-screen__right' });

      const maxPlayers = this.#getMaxPlayersForLobbyType(this.#lobbyType);
      this.#queueBar = new QueueStatusBar({
        queueKey: `queue_${this.#lobbyType}`,
        minPlayers: maxPlayers,
        currentPlayers: 1,
        onLeave: () => this.#onLeaveRoom(),
      });
      rightSection.append(this.#queueBar.create());

      this.#chatBox = new ChatBox({
        roomKey: this.#matchId,
        userId: this.#userId,
      });
      rightSection.append(this.#chatBox.create());

      main.append(leftSection, rightSection);
      container.append(main);

      // Escrever presença e iniciar listener de presença/game-table
      await this.#writeOwnPresence();
      this.#startPresenceListener();
    } catch (err) {
      console.error('[MatchRoomUI] #initWithMatchId falhou:', err);
      this.#renderError();
    }
  }

  /**
   * Limpa ao sair da tela.
   */
  onExit() {
    console.log(`[MatchRoomScreen] Saindo: matchId="${this.#matchId}" lobbyType="${this.#lobbyType}"`);

    // Cancela timeout de assign pendente
    if (this.#assignTimeoutId !== null) {
      clearTimeout(this.#assignTimeoutId);
      this.#assignTimeoutId = null;
    }

    // Cancela listener de assign
    this.#assignUnsubscribe?.();
    this.#assignUnsubscribe = null;

    this.#stopPresencePolling();

    // Para listener de presença
    if (this.#matchPlayersUnsubscribe) {
      MatchService.getInstance().stopSubscribingPresence(this.#matchId);
      this.#matchPlayersUnsubscribe();
      this.#matchPlayersUnsubscribe = null;
    }

    // Remove presença do usuário no match
    // Só remove se NÃO foi para GameTableScreen — lá a presença é re-escrita e precisa permanecer
    if (this.#matchId && !this.#hasNavigatedToGameTable) {
      MatchService.getInstance().removePresence(this.#matchId, this.#userId)
        .catch(err => console.warn('[MatchRoomScreen] Erro ao remover presença:', err));

      // Para listener de chat
      MatchService.getInstance().stopObservingMatchFully(this.#matchId);

      // Se saiu antes da partida iniciar e match tem > 60s, marca como abandoned
      if (!this.#hasNavigatedToGameTable) {
        import('../repositories/MatchRepository.js')
          .then(({ MatchRepository }) =>
            MatchRepository?.getInstance()?.markAbandonedIfStale(this.#matchId)
          )
          .catch(() => {});
      }
    }

    // Destroi componente de chat
    this.#chatBox?.destroy();

    // Remove da fila no Firebase
    if (this.#lobbyType && this.#userId) {
      MatchmakingService.getInstance().leaveQueue(this.#lobbyType, this.#userId)
        .catch(err => console.error(`[MatchRoomScreen] Erro ao sair da fila:`, err));
    }
  }

  /**
   * Handler: usuário sai da sala.
   * @private
   */
  #onLeaveRoom() {
    console.log(`[MatchRoomScreen] Sair clicado: matchId="${this.#matchId}" lobbyType="${this.#lobbyType}"`);
    MatchmakingService.getInstance().leaveQueue(this.#lobbyType, this.#userId)
      .catch(err => console.error(`[MatchRoomScreen] Erro ao sair da fila:`, err));
    this.#screenManager.show('RoomsScreen');
  }

  /**
   * FASE 2: Escreve a própria presença no Firebase.
   * @private
   */
  async #writeOwnPresence() {
    try {
      const userProfile = await UserRepository.getInstance().getProfile(this.#userId);
      const userData = {
        name:      userProfile?.name      || 'Jogador',
        avatarUrl: userProfile?.avatarUrl || null,
      };

      await MatchService.getInstance().writePresence(
        this.#matchId,
        this.#userId,
        userData
      );
    } catch (error) {
      console.error('[MatchRoomScreen] Erro ao escrever presença:', error);
    }
  }

  /**
   * FASE 2: Escuta presença em tempo real e abre GameTableScreen quando pronto.
   * @private
   */
  #startPresenceListener() {
    const matchService = MatchService.getInstance();

    this.#matchPlayersUnsubscribe = matchService.subscribePresence(
      this.#matchId,
      (players) => {
        const count = players.length;

        // Atualiza barra de status
        this.#queueBar?.updateCount(count);

        // Atualiza lista de jogadores
        players.forEach(player => {
          if (player.uid !== this.#userId) {
            this.#playersList?.setPlayer(player.uid, {
              name: player.name || 'Jogador',
              avatarUrl: player.avatarUrl || null,
              ready: false,
            });
          }
        });

        // Descobre maxPlayers do lobbyType
        const maxPlayers = this.#getMaxPlayersForLobbyType(this.#lobbyType);

        // Quando atinge o limite, abre GameTableScreen
        if (count >= maxPlayers && maxPlayers > 0 && !this.#hasNavigatedToGameTable) {
          this.#hasNavigatedToGameTable = true;

          console.log(`[GameTable] opening with count=${count} matchId=${this.#matchId}`);

          // Navega para GameTableScreen
          NavigationService.getInstance().toGameTable({
            matchId: this.#matchId,
            roomType: this.#lobbyType,
            players: players,
            myUid: this.#userId
          }).catch(err => {
            console.error('[GameTable] Erro ao navegar para GameTableScreen:', err);
            // Reseta flag se falhar
            this.#hasNavigatedToGameTable = false;
          });
        }
      }
    );
  }

  /**
   * Obtém o máximo de jogadores para um lobbyType.
   * @private
   */
  #getMaxPlayersForLobbyType(lobbyType) {
    const match = lobbyType.match(/^(\d+)p$/);
    if (match) {
      return parseInt(match[1], 10);
    }
    
    if (lobbyType === 'multi') {
      return 6; // multi pode ter até 6, mas abre com 2+
    }
    
    return 2; // default
  }

  /**
   * Para o polling de presença.
   * @private
   */
  #stopPresencePolling() {
    if (this.#presencePolling !== null) {
      clearInterval(this.#presencePolling);
      this.#presencePolling = null;
    }
  }
}
