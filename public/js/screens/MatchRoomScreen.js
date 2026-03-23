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
import { AdService } from '../services/adService.js';
import { AdConfig }  from '../services/adConfig.js';

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

  /** @type {number|null} Conta jogadores atribuídos ao match (recebido via assignment, para multi/tournament) */
  #expectedPlayerCount = null;

  /** @type {Function|null} Unsubscriber do listener de assign no RTDB */
  #assignUnsubscribe = null;

  /** @type {ReturnType<typeof setTimeout>|null} Timeout de 20s aguardando assign */
  #assignTimeoutId = null;

  /** @type {boolean} Se o rewarded de primeiro jogador já foi usado neste lobby */
  #rewardedFirstPlayerUsed = false;

  /** @type {number} Contagem atual de jogadores na sala */
  #currentPlayerCount = 1;

  /** @type {HTMLElement|null} Container raiz resolvido uma vez em onEnter */
  #containerEl = null;

  /** @type {ReturnType<typeof setTimeout>|null} Timer de 15s para interstitial no lobby */
  #lobbyInterstitialTimer = null;

  /** @type {boolean} Se o interstitial de lobby já foi exibido nesta sessão de tela */
  #lobbyInterstitialShown = false;

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
    this.#expectedPlayerCount = null;
    this.#rewardedFirstPlayerUsed = false;
    this.#lobbyInterstitialShown = false;
    this.#clearLobbyInterstitialTimer();

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
        // Armazena contagem real de jogadores do match (necessário para multi/tournament)
        if (assignment.playerCount) {
          this.#expectedPlayerCount = assignment.playerCount;
        }
        console.log(`[Assign] received matchId=${assignment.matchId} lobbyType=${this.#lobbyType} playerCount=${assignment.playerCount ?? '?'}`);

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

      // ── Banner de anúncio na sala de espera ──────────────
      const adBanner = Dom.create('div', {
        classes: 'ad-slot',
        attrs: { id: 'ad-banner-waiting' },
      });
      wrapper.append(adBanner);

      // ── Rewarded opcional: assistir vídeo ────────────────
      if (AdConfig.enableRewarded) {
        const rewardSlot = Dom.create('div', {
          classes: 'reward-slot',
          attrs: { id: 'rewarded-waiting-slot' },
        });
        const rewardBtn = Dom.create('button', {
          classes: 'reward-slot__btn',
          text: '\uD83C\uDFAC Assistir vídeo e ganhar benefício',
          attrs: { type: 'button' },
        });
        rewardBtn.addEventListener('click', async () => {
          rewardBtn.disabled = true;
          rewardBtn.textContent = 'Carregando\u2026';
          const result = await AdService.getInstance()
            .showRewarded(AdConfig.rewardedTriggers.waitingReward)
            .catch(() => ({ rewarded: false }));
          if (result.rewarded) {
            AdService.getInstance().grantReward(AdConfig.rewardTypes.waitingReward);
            rewardBtn.textContent = '\u2705 Benefício recebido!';
          } else {
            rewardBtn.textContent = '\uD83C\uDFAC Assistir vídeo e ganhar benefício';
            rewardBtn.disabled = false;
          }
        });
        rewardSlot.append(rewardBtn);
        wrapper.append(rewardSlot);
      }

      // ── Mostrar banner (serviço) ─────────────────────────
      AdService.getInstance().showBanner(AdConfig.bannerPlacements.waiting);

      // ── Interstitial após 15 s no lobby (apenas 1×) ──────
      if (!this.#lobbyInterstitialShown) {
        this.#clearLobbyInterstitialTimer();
        this.#lobbyInterstitialTimer = setTimeout(async () => {
          if (this.#lobbyInterstitialShown) return;
          this.#lobbyInterstitialShown = true;
          // TODO [AdMob]: Substituir por chamada real ao AdMob via bridge TWA
          await AdService.getInstance()
            .showInterstitial(AdConfig.interstitialTriggers.lobbyWait)
            .catch(() => {});
        }, 15_000);
      }

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
        matchId: this.#matchId,
        myUid: this.#userId,
        players: [
          { uid: this.#userId, name: 'Você', avatarUrl: null },
        ],
      });
      rightSection.append(this.#chatBox.create());

      main.append(leftSection, rightSection);
      container.append(main);

      // ── Slot de recompensa para primeiro jogador ─────────────────
      // Visível apenas quando é o primeiro jogador na sala.
      // O listener de presença esconde quando há > 1 jogador.
      if (AdConfig.enableFirstPlayerReward && !this.#rewardedFirstPlayerUsed) {
        const fpSlot = Dom.create('div', {
          classes: 'reward-slot',
          attrs: { id: 'rewarded-first-player-slot' },
        });
        const fpBtn = Dom.create('button', {
          classes: 'reward-slot__btn',
          text: '\uD83C\uDFAC Assistir vídeo e acelerar início',
          attrs: { type: 'button' },
        });
        fpBtn.addEventListener('click', async () => {
          if (this.#rewardedFirstPlayerUsed) return;
          // Não pode acelerar sozinho — precisa de jogadores mínimos
          const maxP = this.#getMaxPlayersForLobbyType(this.#lobbyType);
          if (this.#currentPlayerCount < maxP) {
            fpBtn.textContent = '⚠️ Aguarde mais jogadores entrarem';
            setTimeout(() => {
              fpBtn.textContent = '\uD83C\uDFAC Assistir vídeo e acelerar início';
            }, 2000);
            return;
          }
          fpBtn.disabled = true;
          fpBtn.textContent = 'Carregando…';
          const result = await AdService.getInstance()
            .showRewarded(AdConfig.rewardedTriggers.firstPlayerBonus)
            .catch(() => ({ rewarded: false }));
          if (result.rewarded) {
            this.#rewardedFirstPlayerUsed = true;
            AdService.getInstance().grantReward(AdConfig.rewardTypes.firstPlayerBonus);
            fpBtn.textContent = '✅ Bônus recebido!';
          } else {
            fpBtn.textContent = '\uD83C\uDFAC Assistir vídeo e acelerar início';
            fpBtn.disabled = false;
          }
        });
        fpSlot.append(fpBtn);
        container.append(fpSlot);
      }

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

    // Esconde banner de espera
    AdService.getInstance().hideBanner(AdConfig.bannerPlacements.waiting);

    // Cancela timer de interstitial do lobby
    this.#clearLobbyInterstitialTimer();

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
      async (players) => {
        const count = players.length;

        // Atualiza contagem interna
        this.#currentPlayerCount = count;

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

        // Mostra/esconde slot de primeiro jogador conforme quantidade de players
        const fpSlot = this.#containerEl?.querySelector('#rewarded-first-player-slot');
        if (fpSlot) {
          fpSlot.style.display = count <= 1 ? '' : 'none';
        }

        // Descobre maxPlayers do lobbyType
        const maxPlayers = this.#getMaxPlayersForLobbyType(this.#lobbyType);

        // Quando atinge o limite, abre GameTableScreen
        if (count >= maxPlayers && maxPlayers > 0 && !this.#hasNavigatedToGameTable) {
          this.#hasNavigatedToGameTable = true;

          console.log(`[GameTable] opening with count=${count} matchId=${this.#matchId}`);

          // Anúncio: intersticial entre a espera e a mesa de jogo
          await AdService.getInstance()
            .showInterstitial(AdConfig.interstitialTriggers.matchFound)
            .catch(() => {});

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
    // Para multi/tournament usa o count real recebido via assignment (evita esperar 6 com 2 atribuídos)
    if ((lobbyType === 'multi' || lobbyType === 'tournament') && this.#expectedPlayerCount) {
      return this.#expectedPlayerCount;
    }

    const match = lobbyType.match(/^(\d+)p$/);
    if (match) {
      return parseInt(match[1], 10);
    }

    if (lobbyType === 'multi' || lobbyType === 'tournament') {
      return 2; // fallback conservador enquanto playerCount ainda não chegou
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

  /**
   * Cancela o timer de interstitial do lobby (se ativo).
   * @private
   */
  #clearLobbyInterstitialTimer() {
    if (this.#lobbyInterstitialTimer !== null) {
      clearTimeout(this.#lobbyInterstitialTimer);
      this.#lobbyInterstitialTimer = null;
    }
  }
}
