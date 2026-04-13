/**
 * @layer screens
 * @group game
 * @role Screen
 * @depends Screen, HeaderBar, ChatBox, PlayersList, LobbyCard, MatchService, MatchmakingService, AuthService, NavigationService, TableLayoutService, GameRoomType
 * @exports MatchRoomScreen
 *
 * Tela de sala de partida multijogador.
 * Exibe: lista de jogadores, chat, status da fila, botão sair.
 * Observa players do match e abre GameTableScreen automaticamente quando há 2-6.
 */
import { Screen } from '../core/Screen.js';
import { ChatBox } from '../components/ChatBox.js';
import { PlayersList } from '../components/PlayersList.js';
import { LobbyCard } from '../components/LobbyCard.js';
import { Dom } from '../utils/Dom.js';
import { MatchService } from '../services/MatchService.js';
import { MatchmakingService } from '../services/MatchmakingService.js';
import { AuthService } from '../services/AuthService.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { NavigationService } from '../services/NavigationService.js';
import { TableLayoutService } from '../services/TableLayoutService.js';
import { GameRoomType } from '../domain/GameRoomType.js';
import { LobbyRepository } from '../repositories/LobbyRepository.js';
import { MatchRepository } from '../repositories/MatchRepository.js';
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

  /** @type {LobbyCard|null} Card de lobby reutilizado tanto na espera pré-assign quanto na sala */
  #lobbyCard = null;

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

  /** @type {boolean} Se o usuário assistiu o vídeo rewarded por completo nesta sessão de sala */
  #waitingAdWatched = false;

  /** @type {boolean} Se o usuário já reivindicou a recompensa nesta sessão de sala */
  #waitingAdClaimed = false;

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
    this.#waitingAdWatched = false;
    this.#waitingAdClaimed = false;
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
   * Reutiliza o componente LobbyCard (div.lobby-card) para manter consistência visual.
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

      // Spinner de busca
      const spinner = Dom.create('div', { classes: 'match-room-screen__spinner' });
      wrapper.append(spinner);

      // Reutiliza LobbyCard (div.lobby-card) — mesmo componente OOP da tela de seleção,
      // adaptado para o contexto de espera passando buttonLabel='Cancelar'.
      const label = mode === 'timeout'
        ? 'Demorou, tente novamente'
        : this.#getLabelForLobbyType(this.#lobbyType);

      this.#lobbyCard = new LobbyCard({
        playersCount: this.#getMaxPlayersForLobbyType(this.#lobbyType),
        queueKey: `queue_${this.#lobbyType}`,
        presenceCount: 0,
        label,
        buttonLabel: 'Cancelar',
        onJoin: () => this.#onLeaveRoom(),
      });
      wrapper.append(this.#lobbyCard.create());

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

      // Reutiliza LobbyCard (div.lobby-card) — mesmo componente OOP da seleção de sala,
      // agora no contexto de sala formada, com N/maxPlayers e botão "Sair da sala".
      this.#lobbyCard = new LobbyCard({
        playersCount: maxPlayers,
        queueKey: `queue_${this.#lobbyType}`,
        presenceCount: 1,
        label: this.#getLabelForLobbyType(this.#lobbyType),
        buttonLabel: 'Sair da sala',
        onJoin: () => this.#onLeaveRoom(),
      });
      rightSection.append(this.#lobbyCard.create());

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

      // ── Recompensa por assistir anúncio na sala de espera ────────
      if (AdConfig.enableRewarded && !this.#waitingAdClaimed) {
        const waitSlot = Dom.create('div', {
          classes: 'reward-slot reward-slot--waiting',
          attrs: { id: 'rewarded-waiting-room-slot' },
        });
        container.append(waitSlot);
        // Renderização assíncrona: verifica status no Firebase antes de exibir
        this.#renderWaitingRoomAdSlot(waitSlot).catch(() => {});
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

        // Atualiza card de lobby com contagem de jogadores presentes
        this.#lobbyCard?.updateCount(count);

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
   * Retorna o limite de slots de recompensa baseado na contagem de jogadores.
   * - 2 jogadores : 1 slot
   * - 3-4 jogadores: 2 slots ("mais de 2 e menos de 5")
   * - 5+ jogadores : 5 slots ("mais de 4")
   * @param {number} playerCount
   * @returns {number}
   * @private
   */
  #getRewardSlotLimit(playerCount) {
    if (playerCount > 4) return 5;
    if (playerCount > 2) return 2;
    return 1;
  }

  /**
   * Renderiza o slot de anúncio recompensado da sala de espera.
   * Fluxo: verificar status → mostrar botão "Assistir" → após anúncio → botão "Resgatar" → reivindicar.
   * @param {HTMLElement} container - elemento onde montar o slot
   * @returns {Promise<void>}
   * @private
   */
  async #renderWaitingRoomAdSlot(container) {
    if (!this.#matchId) return;

    const playerCount = this.#expectedPlayerCount || this.#getMaxPlayersForLobbyType(this.#lobbyType);
    const slotLimit = this.#getRewardSlotLimit(playerCount);

    // Verifica status atual no Firebase
    const { hasClaimed, currentCount } = await MatchRepository.getInstance()
      .getAdRewardStatus(this.#matchId, this.#userId)
      .catch(() => ({ hasClaimed: false, currentCount: 0 }));

    if (hasClaimed) {
      // Usuário já reivindicou neste match (pode ter saído e voltado)
      this.#waitingAdClaimed = true;
      const done = Dom.create('p', {
        classes: 'reward-slot__done',
        text: '✅ Benefício já aplicado nesta partida!',
      });
      container.append(done);
      return;
    }

    if (currentCount >= slotLimit) {
      // Slots esgotados para este match
      const full = Dom.create('p', {
        classes: 'reward-slot__full',
        text: `🔒 Todos os ${slotLimit} benefício(s) desta sala já foram resgatados`,
      });
      container.append(full);
      return;
    }

    const slotsLeft = slotLimit - currentCount;

    // ── Estado 1: botão "Assistir vídeo" ────────────────────────
    if (!this.#waitingAdWatched) {
      const info = Dom.create('p', {
        classes: 'reward-slot__info',
        text: `🎁 ${slotsLeft} benefício(s) disponível(is) nesta sala — assista um anúncio para resgatar`,
      });
      const watchBtn = Dom.create('button', {
        classes: 'reward-slot__btn reward-slot__btn--watch',
        text: '🎬 Assistir vídeo e ganhar benefício',
        attrs: { type: 'button' },
      });

      watchBtn.addEventListener('click', async () => {
        if (this.#waitingAdWatched || this.#waitingAdClaimed) return;
        watchBtn.disabled = true;
        watchBtn.textContent = 'Carregando anúncio…';

        const result = await AdService.getInstance()
          .showRewarded(AdConfig.rewardedTriggers.waitingReward)
          .catch(() => ({ rewarded: false }));

        if (result.rewarded) {
          this.#waitingAdWatched = true;
          // Remove UI do estado 1 e exibe estado 2
          container.innerHTML = '';
          this.#renderWaitingRoomClaimStep(container, slotLimit).catch(() => {});
        } else {
          watchBtn.textContent = '🎬 Assistir vídeo e ganhar benefício';
          watchBtn.disabled = false;
        }
      });

      container.append(info, watchBtn);
      return;
    }

    // ── Estado 2: botão "Resgatar" (usuário já assistiu nesta sessão) ─
    this.#renderWaitingRoomClaimStep(container, slotLimit).catch(() => {});
  }

  /**
   * Renderiza o botão de resgate após o usuário ter assistido ao vídeo.
   * @param {HTMLElement} container
   * @param {number} slotLimit
   * @returns {Promise<void>}
   * @private
   */
  async #renderWaitingRoomClaimStep(container, slotLimit) {
    if (this.#waitingAdClaimed) return;

    const claimBtn = Dom.create('button', {
      classes: 'reward-slot__btn reward-slot__btn--claim',
      text: '🎁 Resgatar benefício',
      attrs: { type: 'button' },
    });

    claimBtn.addEventListener('click', async () => {
      if (this.#waitingAdClaimed) return;
      claimBtn.disabled = true;
      claimBtn.textContent = 'Resgatando…';

      const { claimed } = await MatchRepository.getInstance()
        .claimAdReward(this.#matchId, this.#userId, slotLimit)
        .catch(() => ({ claimed: false }));

      container.innerHTML = '';

      if (claimed) {
        this.#waitingAdClaimed = true;
        AdService.getInstance().grantReward(AdConfig.rewardTypes.waitingReward);
        const done = Dom.create('p', {
          classes: 'reward-slot__done',
          text: '✅ Benefício recebido! Boa sorte na partida 🃏',
        });
        container.append(done);
      } else {
        // Slots foram esgotados por outro jogador no interim
        const full = Dom.create('p', {
          classes: 'reward-slot__full',
          text: '😔 Outra pessoa resgatou o último benefício antes de você',
        });
        container.append(full);
      }
    });

    container.append(claimBtn);
  }

  /**
   * Retorna um label legível para o tipo de lobby.
   * Usado pelo LobbyCard para o título do card de espera/sala.
   * @param {string} lobbyType
   * @returns {string}
   * @private
   */
  #getLabelForLobbyType(lobbyType) {
    if (lobbyType === 'tournament') return 'Torneio';
    if (lobbyType === 'multi') return 'Multijogador';
    const m = lobbyType?.match(/^(\d+)p$/);
    if (m) return `${m[1]} Jogadores`;
    return 'Partida';
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
