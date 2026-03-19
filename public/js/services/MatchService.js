/**
 * @layer services
 * @group match
 * @role Service
 * @depends FirebaseService, MatchRepository, AuthService
 * @exports MatchService
 *
 * Serviço de partidas: presença em tempo real + chat com limitação.
 * Observa usuários ativos em filas/salas e gerencia mensagens de chat.
 * Usa RTDB via MatchRepository (não localStorage).
 */
import { MatchRepository } from '../repositories/MatchRepository.js';
import { LobbyRepository } from '../repositories/LobbyRepository.js';
import { AuthService } from '../services/AuthService.js';

export class MatchService {
  /** @type {MatchService|null} */
  static #instance = null;

  /** @type {MatchRepository} */
  #matchRepository;

  /** @type {LobbyRepository} */
  #lobbyRepository;

  /** @type {Map<string, Function>} Unsubscribers de listeners ativos (matchId -> unsubscribe) */
  #chatListeners = new Map();

  /** @type {Map<string, Object[]>} Cache local de mensagens por matchId */
  #chatCache = new Map();

  /** @type {Map<string, number>} Timestamp da última mensagem por usuário (anti-spam) */
  #lastMessageTime = new Map();

  /** @type {number} Intervalo mínimo entre mensagens (ms) */
  #minMessageInterval = 1000;

  /** @type {Map<string, Function>} Unsubscribers de listeners de fila (lobbyType -> unsubscribe) */
  #queueListeners = new Map();

  /** @type {Map<string, Object>} Cache local de usuários por lobbyType */
  #queueCache = new Map();

  /** @type {Map<string, Function>} Unsubscribers de listeners de players do match (matchId -> unsubscribe) */
  #matchPlayersListeners = new Map();

  /** @type {Map<string, Function>} Unsubscribers de listeners de presença (matchId -> unsubscribe) */
  #presenceListeners = new Map();

  // -------------------------------------------------------
  // Singleton
  // -------------------------------------------------------
  static getInstance() {
    if (!MatchService.#instance) {
      MatchService.#instance = new MatchService(
        MatchRepository.getInstance(),
        LobbyRepository.getInstance()
      );
    }
    return MatchService.#instance;
  }

  constructor(matchRepository, lobbyRepository) {
    this.#matchRepository = matchRepository;
    this.#lobbyRepository = lobbyRepository;
  }

  // -------------------------------------------------------
  // Presença (Onlinestatus) - localStorage temporário
  // -------------------------------------------------------

  /**
   * Registra presença do usuário em uma fila (ex: "queue_2p").
   * TODO: Migrar para Firebase presence + onDisconnect.
   * Por enquanto, stored em localStorage.
   * @param {string} userId
   * @param {string} queueKey - ex: "queue_2p", "queue_tournament"
   * @param {Object} userData - { name, avatarUrl }
   * @returns {Promise<void>}
   */
  async registerPresence(userId, queueKey, userData) {
    console.log(`[MatchService] ${userId} entrando em ${queueKey}`);
    const key = `presence_${queueKey}`;
    const users = JSON.parse(localStorage.getItem(key) || '{}');
    users[userId] = { ...userData, joinedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(users));
  }

  /**
   * Remove presença do usuário de uma fila.
   * @param {string} userId
   * @param {string} queueKey
   */
  removePresence(userId, queueKey) {
    console.log(`[MatchService] ${userId} saindo de ${queueKey}`);
    const key = `presence_${queueKey}`;
    const users = JSON.parse(localStorage.getItem(key) || '{}');
    delete users[userId];
    localStorage.setItem(key, JSON.stringify(users));
  }

  /**
   * Obtém lista de usuários presentes em uma fila.
   * @param {string} queueKey
   * @returns {Object} { userId: { name, avatarUrl, joinedAt } }
   */
  getQueueUsers(queueKey) {
    const key = `presence_${queueKey}`;
    return JSON.parse(localStorage.getItem(key) || '{}');
  }

  // -------------------------------------------------------
  // Chat — Via RTDB
  // -------------------------------------------------------

  /**
   * Envia mensagem de chat FASE 3.
   * Usa uid real do Firebase Auth, não userId arbitrário.
   * Implementa anti-spam (1 msg/seg por usuário).
   * @param {string} matchId - ex: "match_abc123"
   * @param {string} text - texto da mensagem
   * @returns {Promise<boolean>} true se enviada, false se bloqueada por anti-spam
   */
  async sendMessage(matchId, text) {
    try {
      // 1. Obtém uid real do Firebase
      const authService = AuthService.getInstance();
      const currentUser = await authService.getCurrentUser();
      
      if (!currentUser || !currentUser.uid) {
        console.error('[Chat] Usuário não autenticado');
        return false;
      }

      const uid = currentUser.uid;
      const now = Date.now();
      const lastTime = this.#lastMessageTime.get(uid) || 0;

      // 2. Anti-spam: 1 msg por segundo
      if (now - lastTime < this.#minMessageInterval) {
        console.warn(`[Chat] Anti-spam ativado para uid=${uid.slice(0, 8)}...`);
        return false;
      }

      // 3. Validação
      const trimmedText = (text || '').trim();
      if (!trimmedText) {
        console.warn('[Chat] Mensagem vazia');
        return false;
      }
      if (trimmedText.length > 200) {
        console.warn('[Chat] Mensagem > 200 caracteres');
        return false;
      }

      this.#lastMessageTime.set(uid, now);

      // 4. Nome: prefere displayName do próprio currentUser, fallback para parte local do email
      const name = currentUser.displayName
        || currentUser.email?.split('@')[0]
        || 'Jogador';

      // 5. Envia mensagem usando push() para chave ordenada do Firebase
      console.log(`[Chat] sending uid=${uid.slice(0, 8)}... matchId=${matchId}`);

      await this.#matchRepository.pushChatMessage(matchId, {
        uid,
        name,
        text: trimmedText,
        ts: now,
      });

      return true;
    } catch (error) {
      console.error(`[Chat] Erro ao enviar mensagem:`, error);
      return false;
    }
  }

  /**
   * Obtém histórico de chat (retorna cache local).
   * @param {string} matchId
   * @returns {Array} Array de mensagens ordenadas por timestamp
   */
  getChatHistory(matchId) {
    const messages = this.#chatCache.get(matchId) || [];
    // Ordena por timestamp (crescente)
    return messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }

  /**
   * FASE 3: Observa novas mensagens em tempo real (onChildAdded incremental).
   * Usa MatchRepository.subscribeChat() com limitToLast(50).
   * Renderiza apenas novas mensagens (sem re-render tudo incorretamente).
   * 
   * @param {string} matchId
   * @param {(message: Object) => void} onMessage - callback com { msgId, uid, name, text, ts }
   * @returns {Function} Unsubscriber
   */
  subscribeChat(matchId, onMessage) {
    console.log(`[Chat] Iniciando subscribeChat para matchId="${matchId}"`);

    // Se já tem listener ativo, remove antes
    if (this.#chatListeners.has(matchId)) {
      console.warn(`[Chat] Listener já ativo para ${matchId}, removendo antigo`);
      const oldUnsub = this.#chatListeners.get(matchId);
      oldUnsub();
      this.#chatListeners.delete(matchId);
    }

    try {
      // Inicializa cache se não existe
      if (!this.#chatCache.has(matchId)) {
        this.#chatCache.set(matchId, []);
      }

      // Subscreve ao MatchRepository (usa onChildAdded)
      const unsubscribe = this.#matchRepository.subscribeChat(
        matchId,
        (message) => {
          // Adiciona mensagem ao cache
          const cache = this.#chatCache.get(matchId) || [];
          
          // Verifica se já existe (por msgId)
          const exists = cache.some(m => m.msgId === message.msgId);
          if (!exists) {
            cache.push(message);
            this.#chatCache.set(matchId, cache);
          }

          console.log(`[Chat] received msgId=${message.msgId} uid=${(message.uid || 'unknown').slice(0, 8)}...`);

          // Chama callback com mensagem individual (incremental)
          onMessage(message);
        }
      );

      // Guarda unsubscriber
      this.#chatListeners.set(matchId, unsubscribe);

      return unsubscribe;
    } catch (error) {
      console.error(`[Chat] Erro ao iniciar subscribeChat (${matchId}):`, error);
      return () => {};
    }
  }

  /**
   * Para de escutar novas mensagens para um matchId específico.
   * @param {string} matchId
   */
  stopSubscribingChat(matchId) {
    const unsubscribe = this.#chatListeners.get(matchId);
    if (unsubscribe) {
      unsubscribe();
      this.#chatListeners.delete(matchId);
      console.log(`[Chat] listener parado para matchId="${matchId}"`);
    }
  }

  /**
   * Observa novas mensagens em tempo real (Firebase onChildAdded).
   * Mantém cache local e chama callback ao receber mensagens.
   * @param {string} matchId
   * @param {(messages: Array) => void} callback - callback com array atualizado
   * @returns {Function} Unsubscriber
   */
  observeChat(matchId, callback) {
    console.log(`[Chat] Iniciando observer para matchId="${matchId}"`);

    // Inicializa cache se não existe
    if (!this.#chatCache.has(matchId)) {
      this.#chatCache.set(matchId, []);
    }

    // Se já tem listener ativo, remove antes
    if (this.#chatListeners.has(matchId)) {
      console.warn(`[Chat] Listener já ativo para ${matchId}, removendo antigo`);
      const oldUnsub = this.#chatListeners.get(matchId);
      oldUnsub();
      this.#chatListeners.delete(matchId);
    }

    try {
      // Subscreve ao MatchRepository
      const unsubscribe = this.#matchRepository.subscribeChat(
        matchId,
        (message) => {
          // Adiciona mensagem ao cache
          const cache = this.#chatCache.get(matchId) || [];
          
          // Verifica se já existe (por msgId)
          const exists = cache.some(m => m.msgId === message.msgId);
          if (!exists) {
            cache.push(message);
            this.#chatCache.set(matchId, cache);
          }

          // Chama callback com array atualizado
          callback(this.getChatHistory(matchId));
        }
      );

      // Guarda unsubscriber
      this.#chatListeners.set(matchId, unsubscribe);

      console.log(`[Chat] Observer ativo para matchId="${matchId}"`);
      return unsubscribe;
    } catch (error) {
      console.error(`[ChatError] Falha ao observar chat (${matchId}):`, error);
      return () => {};
    }
  }

  /**
   * Para de observar chat para um matchId específico.
   * @param {string} matchId
   */
  stopObservingChat(matchId) {
    const unsubscribe = this.#chatListeners.get(matchId);
    if (unsubscribe) {
      unsubscribe();
      this.#chatListeners.delete(matchId);
      console.log(`[Chat] Observer parado para matchId="${matchId}"`);
    }
  }

  // -------------------------------------------------------
  // Fila em Tempo Real — Via RTDB
  // -------------------------------------------------------

  /**
   * Observa usuários em fila em tempo real.
   * Mantém cache local e chama callback ao mudar contagem.
   * @param {string} lobbyType - ex: "2p", "6p", "tournament"
   * @param {(users: Object) => void} callback - { userId: userData, ... }
   * @returns {Function} Unsubscriber
   */
  subscribeQueueUsers(lobbyType, callback) {
    console.log(`[Queue] Iniciando listener para lobbyType="${lobbyType}"`);

    // Se já tem listener ativo, remove antes
    if (this.#queueListeners.has(lobbyType)) {
      console.warn(`[Queue] Listener já ativo para ${lobbyType}, removendo antigo`);
      const oldUnsub = this.#queueListeners.get(lobbyType);
      oldUnsub();
      this.#queueListeners.delete(lobbyType);
    }

    try {
      // Subscreve ao LobbyRepository
      const unsubscribe = this.#lobbyRepository.subscribeQueueUsers(
        lobbyType,
        (users) => {
          // Atualiza cache
          this.#queueCache.set(lobbyType, users || {});

          const count = Object.keys(users || {}).length;
          console.log(`[Queue] Atualizado: ${count} usuários em lobbyType="${lobbyType}"`);

          // Chama callback com usuários atualizados
          callback(users || {});
        }
      );

      // Guarda unsubscriber
      this.#queueListeners.set(lobbyType, unsubscribe);

      console.log(`[Queue] Listener ativo para lobbyType="${lobbyType}"`);
      return unsubscribe;
    } catch (error) {
      console.error(`[QueueError] Falha ao observar fila (${lobbyType}):`, error);
      return () => {};
    }
  }

  /**
   * Para de observar fila para um lobbyType específico.
   * @param {string} lobbyType
   */
  stopObservingQueue(lobbyType) {
    const unsubscribe = this.#queueListeners.get(lobbyType);
    if (unsubscribe) {
      unsubscribe();
      this.#queueListeners.delete(lobbyType);
      console.log(`[Queue] Listener parado para lobbyType="${lobbyType}"`);
    }
  }

  // -------------------------------------------------------
  // Match Players — Observa jogadores específicos do match
  // -------------------------------------------------------

  /**
   * Observa lista de jogadores em um match específico.
   * Busca de /matches/{matchId}/meta/players (ou structure similar).
   * Chama callback com array atualizado sempre que houver mudança.
   * 
   * @param {string} matchId - ID da partida
   * @param {(players: Object[]) => void} callback - callback com array de jogadores {uid, name, avatarUrl, joinedAt}
   * @returns {Function} Unsubscriber
   */
  observeMatchPlayers(matchId, callback) {
    console.log(`[GameTable] iniciando listener para matchId="${matchId}"`);

    // Se já tem listener ativo, remove antes
    if (this.#matchPlayersListeners.has(matchId)) {
      console.warn(`[GameTable] Listener já ativo para matchId="${matchId}", removendo antigo`);
      const oldUnsub = this.#matchPlayersListeners.get(matchId);
      oldUnsub();
      this.#matchPlayersListeners.delete(matchId);
    }

    try {
      // Usa MatchRepository para observar players do match
      const unsubscribe = this.#matchRepository.observeMatchPlayers(
        matchId,
        (players) => {
          // Converte objeto para array se necessário
          const playersArray = Array.isArray(players)
            ? players
            : Object.values(players || {});

          const count = playersArray.length;
          console.log(`[GameTable] atualizado: ${count} jogadores em matchId="${matchId}"`);

          // Chama callback com array atualizado
          callback(playersArray);
        }
      );

      // Guarda unsubscriber
      this.#matchPlayersListeners.set(matchId, unsubscribe);

      console.log(`[GameTable] listener ativo para matchId="${matchId}"`);
      return unsubscribe;
    } catch (error) {
      console.error(`[GameTable] Falha ao observar players (${matchId}):`, error);
      return () => {};
    }
  }

  /**
   * Para de observar players para um matchId específico.
   * @param {string} matchId
   */
  stopObservingMatch(matchId) {
    const unsubscribe = this.#matchPlayersListeners.get(matchId);
    if (unsubscribe) {
      unsubscribe();
      this.#matchPlayersListeners.delete(matchId);
      console.log(`[GameTable] listener parado para matchId="${matchId}"`);
    }
  }

  /**
   * Para de observar chat E match players para um matchId específico (limpeza total).
   * @param {string} matchId
   */
  stopObservingMatchFully(matchId) {
    this.stopObservingChat(matchId);
    this.stopObservingMatch(matchId);
  }

  /**
   * Sai de uma partida: remove presença e para todos os listeners do match.
   * NÃO deleta o match — apenas remove o jogador.
   * @param {string} matchId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async leaveMatch(matchId, uid) {
    console.log(`[GameExit] leaveMatch matchId=${matchId} uid=${uid?.slice(0, 8)}...`);
    this.stopObservingMatchFully(matchId);
    this.stopSubscribingPresence(matchId);
    await this.removePresence(matchId, uid);
    console.log(`[GameExit] presence removed uid=${uid?.slice(0, 8)}...`);
  }

  // -------------------------------------------------------
  // Presença em Tempo Real (Firebase presence)
  // -------------------------------------------------------

  /**
   * Escreve presença do usuário em /matches/{matchId}/presence/{uid}.
   * Configura onDisconnect().remove() para limpeza automática.
   * 
   * @param {string} matchId - ID da partida
   * @param {string} uid - UID do usuário
   * @param {Object} userData - { name, avatarUrl, ... }
   * @returns {Promise<void>}
   */
  async writePresence(matchId, uid, userData) {
    try {
      const db = this.#matchRepository.getDatabase();
      const dbMod = this.#matchRepository.getDbModules();
      
      if (!db) {
        throw new Error('[Presence] Database não inicializado');
      }

      const presencePath = `matches/${matchId}/presence/${uid}`;
      const presenceRef = dbMod.ref(db, presencePath);

      // Usa onDisconnect para remover presença automaticamente
      const presenceData = {
        uid,
        name: userData.name || 'Jogador Desconhecido',
        avatarUrl: userData.avatarUrl || null,
        joinedAt: Date.now(),
        lastSeen: Date.now(),
      };

      await dbMod.set(presenceRef, presenceData);
      
      // Configura remoção automática ao desconectar
      dbMod.onDisconnect(presenceRef).remove();

      console.log(`[Presence] my uid=${uid.slice(0, 8)}... wrote presence in ${matchId}`);

      // Incrementa joinedCount no meta (ativa status=active quando all players joined)
      try {
        const metaSnap = await dbMod.get(dbMod.ref(db, `matches/${matchId}/meta`));
        const metaVal = metaSnap.exists() ? metaSnap.val() : {};
        const maxPlayers = metaVal.maxPlayers || 2;
        await this.#matchRepository.incrementJoinedCount(matchId, maxPlayers);
      } catch (countErr) {
        console.warn(`[Presence] incrementJoinedCount falhou (não crítico):`, countErr);
      }
    } catch (error) {
      console.error(`[Presence] Erro ao escrever presença (${matchId}/${uid}):`, error);
      throw error;
    }
  }

  /**
   * Escuta mudanças em tempo real de presença: /matches/{matchId}/presence
   * Chama callback sempre que há mudança (novo jogador, saída, etc).
   * 
   * @param {string} matchId - ID da partida
   * @param {(players: Object[]) => void} callback - Recebe array de jogadores { uid, name, avatarUrl, joinedAt }
   * @returns {Function} Unsubscriber
   */
  subscribePresence(matchId, callback) {
    try {
      const db = this.#matchRepository.getDatabase();
      const dbMod = this.#matchRepository.getDbModules();

      if (!db) {
        console.error('[Presence] Database não inicializado');
        return () => {};
      }

      // Para listener anterior se existir
      if (this.#presenceListeners.has(matchId)) {
        const oldUnsub = this.#presenceListeners.get(matchId);
        oldUnsub();
        this.#presenceListeners.delete(matchId);
      }

      const presencePath = `matches/${matchId}/presence`;
      const presenceRef = dbMod.ref(db, presencePath);

      // Escuta mudanças em tempo real
      const unsubscribe = dbMod.onValue(presenceRef, (snapshot) => {
        const presenceData = snapshot.val() || {};
        const players = Object.values(presenceData);
        const count = players.length;

        console.log(`[Presence] count=${count} matchId=${matchId}`);

        // Chama callback com array de jogadores
        callback(players);
      }, (error) => {
        console.error(`[Presence] Erro ao escutar presença (${matchId}):`, error);
      });

      // Armazena unsubscriber
      this.#presenceListeners.set(matchId, unsubscribe);

      return unsubscribe;
    } catch (error) {
      console.error(`[Presence] Erro ao iniciar subscribePresence (${matchId}):`, error);
      return () => {};
    }
  }

  /**
   * Para de escutar presença para um matchId específico.
   * @param {string} matchId
   */
  stopSubscribingPresence(matchId) {
    const unsubscribe = this.#presenceListeners.get(matchId);
    if (unsubscribe) {
      unsubscribe();
      this.#presenceListeners.delete(matchId);
      console.log(`[Presence] listener parado para matchId="${matchId}"`);
    }
  }

  /**
   * Remove presença do usuário manualmente.
   * @param {string} matchId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async removePresence(matchId, uid) {
    try {
      const db = this.#matchRepository.getDatabase();
      const dbMod = this.#matchRepository.getDbModules();

      if (!db) {
        throw new Error('[Presence] Database não inicializado');
      }

      const presencePath = `matches/${matchId}/presence/${uid}`;
      const presenceRef = dbMod.ref(db, presencePath);
      await dbMod.remove(presenceRef);

      console.log(`[Presence] uid=${uid.slice(0, 8)}... presença removida`);
    } catch (error) {
      console.error(`[Presence] Erro ao remover presença (${matchId}/${uid}):`, error);
    }
  }

  // -------------------------------------------------------
  // Estado de Jogo (Embaralhar / Entregar)
  // -------------------------------------------------------

  /**
   * Escreve um evento de estado de jogo no RTDB.
   * Path: /matches/{matchId}/gameState
   * Chamado pelo dealer; todos os clientes subscribeGameState recebem o evento.
   *
   * @param {string} matchId
   * @param {{ phase: string, ts: number, [key: string]: any }} state
   * @returns {Promise<void>}
   */
  async writeGameState(matchId, state) {
    const db    = this.#matchRepository.getDatabase();
    const dbMod = this.#matchRepository.getDbModules();
    if (!db) throw new Error('[GameState] Database não inicializado');

    // Para turn_start: tenta via servidor primeiro (escrita autoritativa evita race conditions)
    if (state.phase === 'turn_start') {
      const apiOk = await this.#callNextTurnAPI(matchId, state).catch(() => false);
      if (apiOk) {
        const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        const env = isPWA ? 'PWA' : 'Navegador';
        console.log(`[TURNO] 🔄 Escrevendo turno → próximo: ${state.activeUid} | fase: ${state.phase} | offset: ${state.turnOffset} | ambiente: ${env} | matchId: ${matchId} | via: API`);
        return;
      }
      // Fallback: escrita direta se a API falhou
      console.warn('[TURNO] ⚠️ API falhou — usando escrita direta no Firebase');
    }

    const ref = dbMod.ref(db, `matches/${matchId}/gameState`);
    await dbMod.set(ref, state);
    console.log(`[GameState] escrito phase=${state.phase} matchId=${matchId}`);

    if (state.phase === 'turn_start') {
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      const env = isPWA ? 'PWA' : 'Navegador';
      console.log(`[TURNO] 🔄 Escrevendo turno → próximo: ${state.activeUid} | fase: ${state.phase} | offset: ${state.turnOffset} | ambiente: ${env} | matchId: ${matchId}`);
    }
  }

  /**
   * Tenta escrever a mudança de turno via endpoint serverless /api/next-turn.
   * O servidor usa Firebase Admin SDK — escrita autoritativa, evita race conditions.
   * Se falhar (offline, rede, API down), retorna false e o caller usa escrita direta.
   * @param {string} matchId
   * @param {Object} state - gameState com phase, activeUid, targetUid, turnOffset, ts
   * @returns {Promise<boolean>} true se o servidor escreveu com sucesso
   * @private
   */
  async #callNextTurnAPI(matchId, state) {
    try {
      const authService = AuthService.getInstance();
      const currentUser = await authService.getCurrentUser();
      const fromUid = currentUser?.uid;
      if (!fromUid) return false;

      const res = await fetch('/api/next-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          fromUid,
          toUid:      state.activeUid,
          targetUid:  state.targetUid,
          phase:      state.phase,
          turnOffset: state.turnOffset,
          ts:         state.ts,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.warn('[next-turn API] Falhou:', data.error);
        return false;
      }
      console.log('[next-turn API] ✅ Turno escrito pelo servidor');
      return true;
    } catch (e) {
      console.warn('[next-turn API] Erro de rede:', e.message);
      return false;
    }
  }

  /**
   * Escuta mudanças no estado de jogo em tempo real.
   * Retorna unsubscriber.
   *
   * @param {string} matchId
   * @param {(state: Object) => void} callback
   * @returns {Function} unsubscribe
   */
  subscribeGameState(matchId, callback) {
    try {
      const db    = this.#matchRepository.getDatabase();
      const dbMod = this.#matchRepository.getDbModules();
      if (!db) {
        console.warn('[GameState] Database não disponível — sincronização desativada');
        return () => {};
      }

      const ref   = dbMod.ref(db, `matches/${matchId}/gameState`);
      const unsub = dbMod.onValue(ref, async (snap) => {
        if (snap.exists()) {
          const data = snap.val();
          if (data?.phase === 'turn_start') {
            const currentUser = await AuthService.getInstance().getCurrentUser();
            const myUid = currentUser?.uid;
            const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
            const env = isPWA ? 'PWA' : 'Navegador';
            console.log(`[TURNO] 📥 Recebendo turno → activePlayer: ${data.activeUid} | target: ${data.targetUid} | fase: ${data.phase} | minha vez: ${data.activeUid === myUid} | ambiente: ${env}`);
          }
          callback(data);
        }
      }, (err) => {
        console.error('[GameState] Erro no listener:', err);
      });

      return unsub;
    } catch (err) {
      console.error('[GameState] Erro ao iniciar subscribeGameState:', err);
      return () => {};
    }
  }

  /**
   * Remove todos os listeners ativos e limpa cache.
   */
  cleanup() {
    this.#chatListeners.forEach((unsub, matchId) => {
      unsub();
      console.log(`[Chat] Cleanup: listener removido para ${matchId}`);
    });
    this.#chatListeners.clear();
    this.#chatCache.clear();

    this.#queueListeners.forEach((unsub, lobbyType) => {
      unsub();
      console.log(`[Queue] Cleanup: listener removido para ${lobbyType}`);
    });
    this.#queueListeners.clear();
    this.#queueCache.clear();

    this.#presenceListeners.forEach((unsub, matchId) => {
      unsub();
      console.log(`[Presence] Cleanup: listener removido para ${matchId}`);
    });
    this.#presenceListeners.clear();

    this.#lastMessageTime.clear();
    console.log('[MatchService] Cleanup completo');
  }
}
