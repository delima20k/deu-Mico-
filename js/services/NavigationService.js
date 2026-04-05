/**
 * @layer services
 * @group navigation
 * @role Service
 * @depends ScreenManager
 * @exports NavigationService
 *
 * Serviço centralizado de navegação entre telas.
 * Encapsula chamadas ao ScreenManager para lógica consistente de roteamento.
 * Implementa Singleton.
 */

export class NavigationService {
  /** @type {NavigationService|null} */
  static #instance = null;

  /** @type {import('../core/ScreenManager.js').ScreenManager} */
  #screenManager;

  /**
   * Obtém a instância única do serviço (Singleton).
   * @returns {NavigationService}
   */
  static getInstance() {
    if (this.#instance === null) {
      throw new Error(
        'NavigationService não foi inicializado. ' +
        'Chame NavigationService.initialize(screenManager) antes de usar.'
      );
    }
    return this.#instance;
  }

  /**
   * Inicializa o serviço com a instância do ScreenManager.
   * @static
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  static initialize(screenManager) {
    if (this.#instance === null) {
      this.#instance = new NavigationService(screenManager);
    }
  }

  /**
   * @param {import('../core/ScreenManager.js').ScreenManager} screenManager
   */
  constructor(screenManager) {
    this.#screenManager = screenManager;
  }

  /**
   * Navega para GameTableScreen com parâmetros de partida.
   * @param {Object} params
   * @param {string} params.matchId
   * @param {string} params.roomType - 2p, 3p, 4p, 5p, 6p, tournament
   * @param {Object[]} params.players - [{uid, name, avatarUrl, joinedAt}, ...]
   * @param {string} params.myUid
   * @returns {Promise<void>}
   */
  async toGameTable(params) {
    const { matchId, roomType, players, myUid } = params;
    
    if (!matchId || !roomType || !players || !myUid) {
      console.error('[NavigationService] Parâmetros inválidos para GameTableScreen', params);
      return;
    }

    console.log(
      `[NavigationService] Navegando para GameTableScreen: ` +
      `matchId=${matchId}, roomType=${roomType}, players=${players.length}, myUid=${myUid}`
    );

    await this.#screenManager.show('GameTableScreen', {
      matchId,
      roomType,
      players,
      myUid
    });
  }

  /**
   * Navega para RoomsScreen.
   * @returns {Promise<void>}
   */
  async toRooms() {
    console.log('[NavigationService] Navegando para RoomsScreen');
    await this.#screenManager.show('RoomsScreen');
  }

  /**
   * Navega para MatchRoomScreen.
   * @param {Object} params
   * @param {string} params.queueKey - queue_2p, queue_3p, etc
   * @param {string} [params.matchId] - ID da partida (opcional)
   * @returns {Promise<void>}
   */
  async toMatchRoom(params) {
    const { queueKey, matchId } = params;
    
    if (!queueKey) {
      console.error('[NavigationService] queueKey inválido para MatchRoomScreen', params);
      return;
    }

    console.log('[NavigationService] Navegando para MatchRoomScreen', params);
    await this.#screenManager.show('MatchRoomScreen', { queueKey, matchId });
  }

  /**
   * Navega para MenuScreen.
   * @returns {Promise<void>}
   */
  async toMenu() {
    console.log('[NavigationService] Navegando para MenuScreen');
    await this.#screenManager.show('MenuScreen');
  }

  /**
   * Navega para HomeScreen.
   * @returns {Promise<void>}
   */
  async toHome() {
    console.log('[NavigationService] Navegando para HomeScreen');
    await this.#screenManager.show('HomeScreen');
  }
}
