/**
 * @layer services
 * @group monitoring
 * @role Service
 * @depends FirebaseService, LobbyRepository, MatchmakingService
 * @exports GameRoomMonitor
 *
 * Monitor em tempo real do estado de uma sala de jogo.
 * Escuta mudanças de contagem de jogadores e dispara callbacks
 * quando a sala está pronta (atingiu limite de jogadores).
 */

import { FirebaseService } from './FirebaseService.js';
import { LobbyRepository } from '../repositories/LobbyRepository.js';
import { MatchmakingService } from './MatchmakingService.js';

export class GameRoomMonitor {
  /** @type {GameRoomMonitor|null} */
  static #instance = null;

  /** @type {FirebaseService} */
  #firebaseService;

  /** @type {LobbyRepository} */
  #lobbyRepository;

  /** @type {MatchmakingService} */
  #matchmakingService;

  /** @type {Map<string, Function>} - Map de lobbyId -> unsubscribe */
  #activeListeners = new Map();

  /** @type {Map<string, Object>} - Map de lobbyId -> { onReady, onPlayerCountChange } */
  #callbacks = new Map();

  /** @type {Map<string, number>} - Cache de contagem de jogadores por lobbyId */
  #playerCountCache = new Map();

  // -------------------------------------------------------
  // Singleton
  // -------------------------------------------------------

  /**
   * Retorna instância única.
   * @static
   * @returns {GameRoomMonitor}
   */
  static getInstance() {
    if (!GameRoomMonitor.#instance) {
      GameRoomMonitor.#instance = new GameRoomMonitor(
        FirebaseService.getInstance(),
        LobbyRepository.getInstance(),
        MatchmakingService.getInstance()
      );
    }
    return GameRoomMonitor.#instance;
  }

  /**
   * @param {FirebaseService} firebaseService
   * @param {LobbyRepository} lobbyRepository
   * @param {MatchmakingService} matchmakingService
   */
  constructor(firebaseService, lobbyRepository, matchmakingService) {
    this.#firebaseService = firebaseService;
    this.#lobbyRepository = lobbyRepository;
    this.#matchmakingService = matchmakingService;
  }

  // -------------------------------------------------------
  // Monitoramento
  // -------------------------------------------------------

  /**
   * Inicia o monitoramento de uma sala (lobby).
   * Escuta mudanças na contagem de jogadores e emite callbacks.
   *
   * @param {string} lobbyId - ID do lobby a monitorar
   * @param {Object} options - Opções de callback
   * @param {Function} options.onReady - (playerIds, lobbyData) => void - chamado quando sala atinge limite
   * @param {Function} options.onPlayerCountChange - (count, maxPlayers, playerIds) => void - a cada mudança
   * @param {Function} options.onError - (error) => void - em caso de erro
   * @returns {Function} Função para parar o monitoramento
   */
  startMonitoring(lobbyId, options = {}) {
    if (!lobbyId) {
      console.error('[GameRoomMonitor] ❌ lobbyId é obrigatório');
      return () => {};
    }

    // Se já está monitorando este lobby, para o anterior
    if (this.#activeListeners.has(lobbyId)) {
      console.warn(`[GameRoomMonitor] ⚠️ Já está monitorando lobbyId="${lobbyId}", parando anterior`);
      this.stopMonitoring(lobbyId);
    }

    console.log(`\n[GameRoomMonitor] 🔍 ===== MONITORAMENTO INICIADO =====`);
    console.log(`[GameRoomMonitor] 📍 Lobby ID: ${lobbyId}`);
    console.log(`[GameRoomMonitor] ⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`[GameRoomMonitor] 👂 Aguardando jogadores...\n`);

    // Armazena callbacks
    this.#callbacks.set(lobbyId, {
      onReady: options.onReady || (() => {}),
      onPlayerCountChange: options.onPlayerCountChange || (() => {}),
      onError: options.onError || (() => {}),
    });

    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();

    if (!db || !dbMod) {
      const error = new Error('[GameRoomMonitor] Database não inicializado');
      const callbacks = this.#callbacks.get(lobbyId);
      callbacks?.onError?.(error);
      return () => {};
    }

    try {
      // Listener em tempo real para a presença de jogadores na sala
      const presencePath = `lobbies/${lobbyId}/presence`;
      const presenceRef = dbMod.ref(db, presencePath);

      const unsubscribe = dbMod.onValue(presenceRef, (snapshot) => {
        const presenceData = snapshot.val() || {};
        const playerIds = Object.keys(presenceData);
        const currentCount = playerIds.length;

        console.log(`[GameRoomMonitor] 👥 Nova contagem de jogadores: ${currentCount}`);
        console.log(`[GameRoomMonitor] 📝 Jogadores: ${playerIds.map(id => id.slice(0, 8)).join(', ')}`);

        // Atualiza cache
        this.#playerCountCache.set(lobbyId, currentCount);

        // Callback de mudança de contagem
        this._notifyPlayerCountChange(lobbyId, currentCount, playerIds);

        // Obtém dados do lobby para verificar limite
        this._checkIfRoomReady(lobbyId, currentCount, playerIds);
      }, (error) => {
        console.error(`[GameRoomMonitor] ❌ Erro ao ouvir presença (${lobbyId}):`, error);
        const callbacks = this.#callbacks.get(lobbyId);
        callbacks?.onError?.(error);
      });

      // Armazena função para parar listener
      this.#activeListeners.set(lobbyId, unsubscribe);
      console.log(`[GameRoomMonitor] ✅ Listener ativado para ${lobbyId}`);

      // Retorna função para parar este monitor
      return () => this.stopMonitoring(lobbyId);

    } catch (error) {
      console.error(`[GameRoomMonitor] ❌ Erro ao iniciar monitoramento (${lobbyId}):`, error);
      const callbacks = this.#callbacks.get(lobbyId);
      callbacks?.onError?.(error);
      return () => {};
    }
  }

  /**
   * Para o monitoramento de uma sala específica.
   * @param {string} lobbyId
   */
  stopMonitoring(lobbyId) {
    if (!this.#activeListeners.has(lobbyId)) {
      console.warn(`[GameRoomMonitor] ⚠️ Nenhum listener ativo para lobbyId="${lobbyId}"`);
      return;
    }

    const unsubscribe = this.#activeListeners.get(lobbyId);
    unsubscribe?.();

    this.#activeListeners.delete(lobbyId);
    this.#callbacks.delete(lobbyId);
    this.#playerCountCache.delete(lobbyId);

    console.log(`[GameRoomMonitor] 🛑 Monitoramento parado para lobbyId="${lobbyId}"`);
    console.log(`[GameRoomMonitor] ℹ️ Listeners ativos restantes: ${this.#activeListeners.size}`);
  }

  /**
   * Para todos os monitoramentos ativos.
   */
  stopAllMonitoring() {
    console.log(`\n[GameRoomMonitor] 🛑 ===== PARANDO TODOS OS MONITORAMENTOS =====`);
    console.log(`[GameRoomMonitor] 📊 Listeners ativos: ${this.#activeListeners.size}`);
    
    const allLobbies = Array.from(this.#activeListeners.keys());
    allLobbies.forEach(lobbyId => {
      console.log(`[GameRoomMonitor] → Parando: ${lobbyId}`);
      this.stopMonitoring(lobbyId);
    });
    
    console.log(`[GameRoomMonitor] ✅ Todos os monitoramentos encerrados\n`);
  }

  // -------------------------------------------------------
  // Privado — Notificações
  // -------------------------------------------------------

  /**
   * Notifica mudança na contagem de jogadores.
   * @private
   */
  _notifyPlayerCountChange(lobbyId, currentCount, playerIds) {
    const callbacks = this.#callbacks.get(lobbyId);
    if (!callbacks?.onPlayerCountChange) return;

    // Busca dados do lobby para obter limite de jogadores
    this.#lobbyRepository.getLobbyById(lobbyId)
      .then(lobby => {
        const maxPlayers = lobby?.getLobbyType?.()?.getMaxPlayers?.() || 0;
        console.log(`[GameRoomMonitor] Notificando mudança: ${currentCount}/${maxPlayers} jogadores`);
        callbacks.onPlayerCountChange(currentCount, maxPlayers, playerIds);
      })
      .catch(error => {
        console.error(`[GameRoomMonitor] Erro ao obter lobby/${lobbyId}:`, error);
      });
  }

  /**
   * Verifica se a sala está pronta (atingiu limite de jogadores).
   * @private
   */
  async _checkIfRoomReady(lobbyId, currentCount, playerIds) {
    try {
      const lobby = await this.#lobbyRepository.getLobbyById(lobbyId);
      if (!lobby) {
        console.warn(`[GameRoomMonitor] Lobby não encontrado: ${lobbyId}`);
        return;
      }

      const maxPlayers = lobby.getLobbyType?.()?.getMaxPlayers?.() || 0;

      console.log(`[GameRoomMonitor] Verificando: ${currentCount}/${maxPlayers} para lobbyId="${lobbyId}"`);

      // Se atingiu o limite, cria match real
      if (currentCount >= maxPlayers && maxPlayers > 0) {
        console.log(`\n[GameRoomMonitor] 🎉 ===== SALA PRONTA! =====`);
        console.log(`[GameRoomMonitor] 📍 Lobby: ${lobbyId}`);
        console.log(`[GameRoomMonitor] 👥 Jogadores: ${currentCount}/${maxPlayers}`);
        console.log(`[GameRoomMonitor] ⏰ Timestamp: ${new Date().toISOString()}`);
        console.log(`[GameRoomMonitor] 🚀 Iniciando criação de match real...\n`);
        
        try {
          // Chama MatchmakingService para criar match real
          const lobbyType = lobby.getLobbyType?.()?.getType?.() || '2p';
          const matchId = await this.#matchmakingService.createMatchWhenReady(lobbyType, playerIds);
          
          console.log(`[GameRoomMonitor] ✅ Match criado com sucesso: ${matchId}\n`);
          
          // Dispara callback onReady com o match criado
          const callbacks = this.#callbacks.get(lobbyId);
          callbacks?.onReady?.(playerIds, lobby);
        } catch (matchError) {
          console.error(`[GameRoomMonitor] ❌ Erro ao criar match:`, matchError);
          const callbacks = this.#callbacks.get(lobbyId);
          callbacks?.onError?.(matchError);
        }
      }
    } catch (error) {
      console.error(`[GameRoomMonitor] Erro ao verificar se sala está pronta (${lobbyId}):`, error);
    }
  }

  // -------------------------------------------------------
  // Utilitários
  // -------------------------------------------------------

  /**
   * Obtém a contagem atual de jogadores em uma sala (do cache).
   * @param {string} lobbyId
   * @returns {number}
   */
  getPlayerCount(lobbyId) {
    return this.#playerCountCache.get(lobbyId) || 0;
  }

  /**
   * Verifica se um lobby está sendo monitorado.
   * @param {string} lobbyId
   * @returns {boolean}
   */
  isMonitoring(lobbyId) {
    return this.#activeListeners.has(lobbyId);
  }

  /**
   * Obtém lista de todos os lobbies sendo monitorados.
   * @returns {string[]}
   */
  getActiveLobbies() {
    return Array.from(this.#activeListeners.keys());
  }
}
