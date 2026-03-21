/**
 * @layer repositories
 * @group matchmaking
 * @role Repository
 * @depends FirebaseService, Match
 * @exports MatchRepository
 *
 * Repository: Acesso aos dados de partidas no Firebase RTDB.
 * Responsável APENAS por operações de CRUD com o banco de dados.
 * Não contém lógica de negócio — somente chamadas ao RTDB.
 * Estrutura: /matches/{matchId}/meta, presence/{uid}, chat/{msgId}, state
 */

import { Match } from '../domain/Match.js';
import { FirebaseService } from '../services/FirebaseService.js';

export class MatchRepository {
  /** @type {MatchRepository|null} */
  static #instance = null;

  /** @type {import('../services/FirebaseService.js').FirebaseService} */
  #firebaseService;

  // -------------------------------------------------------
  // Singleton
  // -------------------------------------------------------

  /**
   * Retorna instância única.
   * @static
   * @returns {MatchRepository}
   */
  static getInstance() {
    if (!MatchRepository.#instance) {
      MatchRepository.#instance = new MatchRepository(FirebaseService.getInstance());
    }
    return MatchRepository.#instance;
  }

  /**
   * @param {import('../services/FirebaseService.js').FirebaseService} firebaseService
   */
  constructor(firebaseService) {
    this.#firebaseService = firebaseService;
  }

  // -------------------------------------------------------
  // Acesso a Firebase (utilidade)
  // -------------------------------------------------------

  /**
   * Retorna a instância do Firebase Realtime Database.
   * @returns {Object|null}
   */
  getDatabase() {
    return this.#firebaseService?.getDatabase?.();
  }

  /**
   * Retorna os módulos do Firebase Database.
   * @returns {Object|null}
   */
  getDbModules() {
    return this.#firebaseService?.getDbModules?.();
  }

  // -------------------------------------------------------
  // Metadados da partida
  // -------------------------------------------------------

  /**
   * Cria uma partida no banco de dados.
   * Path: /matches/{matchId}/meta
   * @param {Match} match - Instância de Match com dados
   * @returns {Promise<void>}
   */
  async createMatch(match) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const matchId = match.getMatchId();
    const metaPath = `matches/${matchId}/meta`;
    const ref = dbMod.ref(db, metaPath);
    
    const maxPlayers = match.getLobbyType().getMaxPlayers();
    
    await dbMod.set(ref, {
      matchId,
      lobbyType: match.getLobbyType().getType(),
      maxPlayers,
      playerIds: match.getPlayerIds(),
      state: 'pending',
      status: 'pending',
      joinedCount: 0,
      createdAt: Date.now(),
      createdTs: match.getCreatedTs(),
      meta: match.getMeta(),
    });

    console.log(`[Match] status=pending matchId=${matchId}`);
  }

  /**
   * Atualiza o status do match (pending → active → abandoned).
   * @param {string} matchId
   * @param {string} status - 'pending' | 'active' | 'abandoned'
   * @returns {Promise<void>}
   */
  async updateMatchStatus(matchId, status) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');

    const ref = dbMod.ref(db, `matches/${matchId}/meta`);
    await dbMod.update(ref, { status, state: status });
    console.log(`[Match] status=${status} matchId=${matchId}`);
  }

  /**
   * Incrementa joinedCount atomicamente e retorna o valor atualizado.
   * Quando joinedCount == maxPlayers, atualiza status para 'active'.
   * @param {string} matchId
   * @param {number} maxPlayers
   * @returns {Promise<number>} novo joinedCount
   */
  async incrementJoinedCount(matchId, maxPlayers) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');

    const countRef = dbMod.ref(db, `matches/${matchId}/meta/joinedCount`);
    const result = await dbMod.runTransaction(countRef, (current) => (current || 0) + 1);
    const newCount = result.snapshot.val() || 1;

    if (newCount >= maxPlayers) {
      await this.updateMatchStatus(matchId, 'active');
    }

    return newCount;
  }

  /**
   * Verifica se o match está pending há mais de ttlMs sem todos entrarem
   * e, caso positivo, marca como abandoned.
   * @param {string} matchId
   * @param {number} [ttlMs=60000]
   * @returns {Promise<boolean>} true se abandonado
   */
  async markAbandonedIfStale(matchId, ttlMs = 60_000) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) return false;

    const metaRef = dbMod.ref(db, `matches/${matchId}/meta`);
    const snap = await dbMod.get(metaRef);
    if (!snap.exists()) return false;

    const meta = snap.val();
    const isPending = meta.status === 'pending';
    const isStale = (Date.now() - (meta.createdAt || 0)) > ttlMs;

    if (isPending && isStale) {
      await dbMod.update(metaRef, { status: 'abandoned', state: 'abandoned' });
      console.log(`[Cleanup] match marcado como abandoned matchId=${matchId}`);
      return true;
    }
    return false;
  }

  /**
   * Cria a estrutura de jogadores de uma partida.
   * Path: /matches/{matchId}/meta/players/{uid}
   * @param {string} matchId
   * @param {Object} players - Map { uid: { name, avatarUrl, joinedAt }, ... }
   * @returns {Promise<void>}
   */
  async createMatchPlayers(matchId, players) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const playersPath = `matches/${matchId}/meta/players`;
    const ref = dbMod.ref(db, playersPath);
    
    // Transforma players={ uid: {...}, ... } em estrutura apropriada
    const playersData = {};
    Object.entries(players).forEach(([uid, playerData]) => {
      playersData[uid] = {
        uid,
        name: playerData.name || 'Jogador Desconhecido',
        avatarUrl: playerData.avatarUrl || null,
        joinedAt: playerData.joinedAt || Date.now(),
      };
    });
    
    await dbMod.set(ref, playersData);
  }

  /**
   * Obtém uma partida pelo ID.
   * @param {string} matchId
   * @returns {Promise<Match|null>}
   */
  async getMatchById(matchId) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const metaPath = `matches/${matchId}/meta`;
    const ref = dbMod.ref(db, metaPath);
    const snap = await dbMod.get(ref);
    
    if (!snap.exists()) return null;
    
    const data = snap.val();
    const { LobbyType } = await import('../domain/LobbyType.js');
    const lobbyType = new LobbyType(data.lobbyType);
    
    const match = new Match({
      matchId: data.matchId,
      lobbyType,
      playerIds: data.playerIds,
      createdTs: data.createdTs,
    });
    match.setState(data.state);
    match.setMeta(data.meta || {});
    
    return match;
  }

  /**
   * Atualiza metadados de uma partida.
   * @param {string} matchId
   * @param {Object} updates
   * @returns {Promise<void>}
   */
  async updateMatch(matchId, updates) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const metaPath = `matches/${matchId}/meta`;
    const ref = dbMod.ref(db, metaPath);
    await dbMod.update(ref, updates);
  }

  /**
   * Define o estado de uma partida.
   * Path: /matches/{matchId}/state
   * @param {string} matchId
   * @param {string} state
   * @returns {Promise<void>}
   */
  async setMatchState(matchId, state) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const statePath = `matches/${matchId}/state`;
    const ref = dbMod.ref(db, statePath);
    await dbMod.set(ref, state);
  }

  /**
   * Obtém o estado de uma partida.
   * @param {string} matchId
   * @returns {Promise<string|null>}
   */
  async getMatchState(matchId) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const statePath = `matches/${matchId}/state`;
    const ref = dbMod.ref(db, statePath);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : null;
  }

  // -------------------------------------------------------
  // Presença de jogadores
  // -------------------------------------------------------

  /**
   * Registra presença de um jogador na partida.
   * Path: /matches/{matchId}/presence/{uid}
   * @param {string} matchId
   * @param {string} uid
   * @param {Object} presenceData - {isOnline, joinedAt, ...}
   * @returns {Promise<void>}
   */
  async registerPresence(matchId, uid, presenceData) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const presencePath = `matches/${matchId}/presence/${uid}`;
    const ref = dbMod.ref(db, presencePath);
    await dbMod.set(ref, {
      uid,
      ...presenceData,
      joinedAt: Date.now(),
    });
  }

  /**
   * Remove presença de um jogador.
   * @param {string} matchId
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async removePresence(matchId, uid) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const presencePath = `matches/${matchId}/presence/${uid}`;
    const ref = dbMod.ref(db, presencePath);
    await dbMod.remove(ref);
  }

  /**
   * Obtém todos os jogadores presentes na partida.
   * @param {string} matchId
   * @returns {Promise<Object>}
   */
  async getPresence(matchId) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const presencePath = `matches/${matchId}/presence`;
    const ref = dbMod.ref(db, presencePath);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : {};
  }

  /**
   * Obtém a presença de um jogador específico.
   * @param {string} matchId
   * @param {string} uid
   * @returns {Promise<Object|null>}
   */
  async getPlayerPresence(matchId, uid) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const presencePath = `matches/${matchId}/presence/${uid}`;
    const ref = dbMod.ref(db, presencePath);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : null;
  }

  // -------------------------------------------------------
  // Chat
  // -------------------------------------------------------

  /**
   * Envia uma mensagem de chat usando Firebase push() (chave ordenada automática).
   * Path: /matches/{matchId}/chat/{pushId}
   * @param {string} matchId
   * @param {Object} messageData - {uid, name, text, ts}
   * @returns {Promise<string>} pushId gerado
   */
  async pushChatMessage(matchId, messageData) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');

    const chatPath = `matches/${matchId}/chat`;
    const chatRef = dbMod.ref(db, chatPath);
    const newRef = dbMod.push(chatRef);

    await dbMod.set(newRef, {
      ...messageData,
      sentAt: Date.now(),
    });

    return newRef.key;
  }

  /**
   * Envia uma mensagem de chat na partida.
   * Path: /matches/{matchId}/chat/{msgId}
   * @param {string} matchId
   * @param {string} msgId - ID único da mensagem
   * @param {Object} messageData - {uid, text, timestamp, ...}
   * @returns {Promise<void>}
   */
  async sendChatMessage(matchId, msgId, messageData) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const chatPath = `matches/${matchId}/chat/${msgId}`;
    const ref = dbMod.ref(db, chatPath);
    
    console.log(`[Chat] Enviando: path="${chatPath}"`, messageData);
    
    try {
      await dbMod.set(ref, {
        msgId,
        ...messageData,
        sentAt: Date.now(),
      });
      console.log(`[Chat] Mensagem enviada com sucesso: ${msgId}`);
    } catch (error) {
      console.error(`[ChatError] Erro ao enviar (${matchId}/${msgId}):`, error);
      throw error;
    }
  }

  /**
   * Obtém as mensagens de chat de uma partida.
   * @param {string} matchId
   * @returns {Promise<Object>}
   */
  async getChatMessages(matchId) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const chatPath = `matches/${matchId}/chat`;
    const ref = dbMod.ref(db, chatPath);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : {};
  }

  /**
   * Remove uma mensagem de chat.
   * @param {string} matchId
   * @param {string} msgId
   * @returns {Promise<void>}
   */
  async deleteChatMessage(matchId, msgId) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const chatPath = `matches/${matchId}/chat/${msgId}`;
    const ref = dbMod.ref(db, chatPath);
    await dbMod.remove(ref);
  }

  /**
   * Limpa todas as mensagens de uma partida.
   * @param {string} matchId
   * @returns {Promise<void>}
   */
  async clearChat(matchId) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const chatPath = `matches/${matchId}/chat`;
    const ref = dbMod.ref(db, chatPath);
    await dbMod.remove(ref);
  }

  /**
   * Deleta uma partida inteira do banco.
   * @param {string} matchId
   * @returns {Promise<void>}
   */
  async deleteMatch(matchId) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[MatchRepository] Database não inicializado');
    
    const matchPath = `matches/${matchId}`;
    const ref = dbMod.ref(db, matchPath);
    await dbMod.remove(ref);
  }

  // -------------------------------------------------------
  // Chat — Real-time Listener
  // -------------------------------------------------------

  /**
   * Observa novas mensagens em tempo real (Firebase onChildAdded).
   * Path: /matches/{matchId}/chat
   * Usa limitToLast(50) para carregar apenas as últimas 50 mensagens.
   * @param {string} matchId
   * @param {(message: Object) => void} onMessage - callback com { msgId, uid, text, timestamp, ... }
   * @returns {Function} unsubscribe function
   */
  subscribeChat(matchId, onMessage) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    
    if (!db) {
      console.error('[MatchRepository.subscribeChat] Database não inicializado');
      return () => {};
    }

    const chatPath = `matches/${matchId}/chat`;
    const chatRef = dbMod.ref(db, chatPath);
    
    // Query com limitToLast(50)
    const q = dbMod.query(chatRef, dbMod.limitToLast(50));

    console.log(`[Chat] Listener iniciado para matchId="${matchId}" em path="${chatPath}"`);

    // Listener em tempo real
    const unsubscribe = dbMod.onChildAdded(q, (snapshot) => {
      const msgId = snapshot.key;
      const message = snapshot.val();
      
      console.log(`[Chat] Nova mensagem recebida: ${msgId}`, message);
      
      onMessage({
        msgId,
        ...message,
      });
    }, (error) => {
      console.error(`[ChatError] Erro ao ouvir chat (${matchId}):`, error);
    });

    // Retorna função para unsubscribe
    return () => {
      unsubscribe();
      console.log(`[Chat] Listener encerrado para matchId="${matchId}"`);
    };
  }

  // -------------------------------------------------------
  // Players do Match — Real-time Listener
  // -------------------------------------------------------

  /**
   * Observa lista de jogadores de um match em tempo real (Firebase onValue).
   * Path: /matches/{matchId}/meta/players (ou /matches/{matchId}/presence)
   * @param {string} matchId
   * @param {(players: Object) => void} onPlayers - callback com { uid: {name, avatarUrl, joinedAt}, ... }
   * @returns {Function} unsubscribe function
   */
  observeMatchPlayers(matchId, onPlayers) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    
    if (!db) {
      console.error('[MatchRepository.observeMatchPlayers] Database não inicializado');
      return () => {};
    }

    // Tenta primeiro /matches/{matchId}/meta/players
    // Se não existir, fallback para /matches/{matchId}/presence
    const playersPath = `matches/${matchId}/meta/players`;
    const playersRef = dbMod.ref(db, playersPath);

    console.log(`[GameTable] Listener iniciado para matchId="${matchId}" em path="${playersPath}"`);

    // Listener em tempo real (onValue para snapshot completo)
    const unsubscribe = dbMod.onValue(playersRef, (snapshot) => {
      const players = snapshot.val() || {};
      
      const count = Object.keys(players).length;
      console.log(`[GameTable] Players snapshot: ${count} jogadores em matchId="${matchId}"`, players);
      
      onPlayers(players);
    }, (error) => {
      console.error(`[GameTable] Erro ao ouvir players (${matchId}):`, error);
    });

    // Retorna função para unsubscribe
    return () => {
      unsubscribe();
      console.log(`[GameTable] Listener encerrado para matchId="${matchId}"`);
    };
  }

  // -------------------------------------------------------
  // Eventos de Animação — Push Queue
  // -------------------------------------------------------

  /**
   * Faz push de um evento de animação na fila imutável.
   * Cada evento tem sua própria chave push (nunca sobrescreve outro).
   * Path: /matches/{matchId}/animations/{pushId}
   * @param {string} matchId
   * @param {Object} event - {type, fromClientUid, ...payload}
   * @returns {Promise<string>} pushId gerado
   */
  async pushAnimEvent(matchId, event) {
    const db    = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) throw new Error('[AnimEvent] Database não inicializado');

    const animRef = dbMod.ref(db, `matches/${matchId}/animations`);
    const newRef  = dbMod.push(animRef);
    await dbMod.set(newRef, { ...event, ts: Date.now() });
    return newRef.key;
  }

  /**
   * Subscreve a novos eventos de animação em tempo real (onChildAdded).
   * Filtra eventos com ts < (agora - 10s) para evitar replay de histórico.
   * Path: /matches/{matchId}/animations
   * @param {string} matchId
   * @param {(event: Object) => void} onEvent - callback {eid, type, fromClientUid, ...payload, ts}
   * @returns {Function} unsubscribe
   */
  subscribeAnimEvents(matchId, onEvent) {
    const db    = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    if (!db) {
      console.warn('[AnimEvent] Database não disponível — animações desativadas');
      return () => {};
    }

    const startTs = Date.now() - 10_000;
    const animRef = dbMod.ref(db, `matches/${matchId}/animations`);
    const q = dbMod.query(
      animRef,
      dbMod.orderByChild('ts'),
      dbMod.startAt(startTs)
    );

    const seen = new Set();
    const unsub = dbMod.onChildAdded(q, (snap) => {
      if (seen.has(snap.key)) return;
      seen.add(snap.key);
      onEvent({ eid: snap.key, ...snap.val() });
    }, (err) => {
      console.error('[AnimEvent] Erro no listener de animações:', err);
    });

    console.log(`[AnimEvent] Listener iniciado para matchId="${matchId}"`);
    return unsub;
  }
}