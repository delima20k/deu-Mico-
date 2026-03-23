/**
 * @layer repositories
 * @group matchmaking
 * @role Repository
 * @depends FirebaseService
 * @exports LobbyRepository
 *
 * Repository: Acesso aos dados de lobbies no Firebase RTDB.
 * Responsável APENAS por operações de CRUD com o banco de dados.
 * Não contém lógica de negócio — somente chamadas ao RTDB.
 * Estrutura: /lobbies/{lobbyType}/queue/{uid}, lock, startToken, deadlineTs, assign/{uid}
 */

import { FirebaseService } from '../services/FirebaseService.js';

export class LobbyRepository {
  /** @type {LobbyRepository|null} */
  static #instance = null;

  /** @type {import('../services/FirebaseService.js').FirebaseService} */
  #firebaseService;

  // -------------------------------------------------------
  // Singleton
  // -------------------------------------------------------

  /**
   * Retorna instância única.
   * @static
   * @returns {LobbyRepository}
   */
  static getInstance() {
    if (!LobbyRepository.#instance) {
      LobbyRepository.#instance = new LobbyRepository(FirebaseService.getInstance());
    }
    return LobbyRepository.#instance;
  }

  /**
   * @param {import('../services/FirebaseService.js').FirebaseService} firebaseService
   */
  constructor(firebaseService) {
    this.#firebaseService = firebaseService;
  }

  // -------------------------------------------------------
  // Operações de fila (queue)
  // -------------------------------------------------------

  /**
   * Adiciona um usuário à fila de um lobby.
   * Path: /lobbies/{lobbyType}/queue/{uid}
   * @param {string} lobbyType - tipo do lobby ('2p', '3p', ..., 'multi')
   * @param {string} uid - ID do usuário
   * @param {Object} userData - dados do usuário {name, avatarUrl, ...}
   * @returns {Promise<void>}
   */
  async joinQueue(lobbyType, uid, userData) {
    const db    = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');

    const queuePath = `lobbies/${lobbyType}/queue/${uid}`;
    const ref = dbMod.ref(db, queuePath);

    // Escreve entrada na fila
    await dbMod.set(ref, {
      uid,
      ...userData,
      joinedAt: Date.now(),
    });
    console.log(`[Queue] wrote queue uid=${uid}`);

    // Configura remoção automática ao desconectar (fecha aba, cai internet)
    await dbMod.onDisconnect(ref).remove();
    console.log(`[Queue] onDisconnect set uid=${uid}`);
  }

  /**
   * Remove um usuário da fila de um lobby.
   * Path: /lobbies/{lobbyType}/queue/{uid}
   * @param {string} lobbyType
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async leaveQueue(lobbyType, uid) {
    const db    = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');

    console.log(`[Queue] leaveQueue uid=${uid}`);
    const queuePath = `lobbies/${lobbyType}/queue/${uid}`;
    const ref = dbMod.ref(db, queuePath);
    await dbMod.remove(ref);
    console.log(`[Queue] removed uid=${uid}`);
  }

  /**
   * Obtém todos os usuários na fila de um lobby.
   * Path: /lobbies/{lobbyType}/queue
   * @param {string} lobbyType
   * @returns {Promise<Object>}
   */
  async getQueueUsers(lobbyType) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');
    
    const queuePath = `lobbies/${lobbyType}/queue`;
    const ref = dbMod.ref(db, queuePath);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : {};
  }

  /**
   * Obtém um usuário específico na fila.
   * @param {string} lobbyType
   * @param {string} uid
   * @returns {Promise<Object|null>}
   */
  async getQueueUser(lobbyType, uid) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');
    
    const queuePath = `lobbies/${lobbyType}/queue/${uid}`;
    const ref = dbMod.ref(db, queuePath);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : null;
  }

  // -------------------------------------------------------
  // Lock (controle de acesso)
  // -------------------------------------------------------

  /**
   * Obtém o lock do lobby.
   * Path: /lobbies/{lobbyType}/lock
   * @param {string} lobbyType
   * @returns {Promise<Object|null>}
   */
  async getLock(lobbyType) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');
    
    const lockPath = `lobbies/${lobbyType}/lock`;
    const ref = dbMod.ref(db, lockPath);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : null;
  }

  /**
   * Define o lock do lobby.
   * @param {string} lobbyType
   * @param {Object} lockData
   * @returns {Promise<void>}
   */
  async setLock(lobbyType, lockData) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');
    
    const lockPath = `lobbies/${lobbyType}/lock`;
    const ref = dbMod.ref(db, lockPath);
    await dbMod.set(ref, lockData);
  }

  /**
   * Remove o lock do lobby.
   * @param {string} lobbyType
   * @returns {Promise<void>}
   */
  async removeLock(lobbyType) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');
    
    const lockPath = `lobbies/${lobbyType}/lock`;
    const ref = dbMod.ref(db, lockPath);
    await dbMod.remove(ref);
  }

  // -------------------------------------------------------
  // StartToken — anti-corrida atômico via runTransaction
  // -------------------------------------------------------

  /**
   * Tenta adquirir o startToken do lobby via RTDB Transaction (atômico).
   * Garante que somente UM coordenador cria o match por rodada.
   *
   * Path: /lobbies/{lobbyType}/startToken
   * Token: { holderUid, ts }
   *
   * @param {string} lobbyType
   * @param {string} holderUid - uid do candidato a coordenador
   * @param {number} [ttlMs=10000] - janela de exclusividade em ms
   * @returns {Promise<boolean>} true se adquiriu, false se outro já detém
   */
  async acquireStartToken(lobbyType, holderUid, ttlMs = 10_000) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');

    const tokenPath = `lobbies/${lobbyType}/startToken`;
    const ref = dbMod.ref(db, tokenPath);

    const result = await dbMod.runTransaction(ref, (current) => {
      const now = Date.now();

      // Nenhum token ativo ou token expirado → adquire
      if (!current || (now - current.ts) > ttlMs) {
        return { holderUid, ts: now };
      }

      // Outro holder válido → aborta sem alterar
      return current;
    });

    const acquired = result.committed && result.snapshot.val()?.holderUid === holderUid;
    console.log(`[StartToken] ${acquired ? 'acquired' : 'rejected'} lobbyType=${lobbyType} uid=${holderUid.slice(0, 8)}...`);
    return acquired;
  }

  /**
   * Libera o startToken do lobby (somente se ainda pertencer a holderUid).
   * @param {string} lobbyType
   * @param {string} holderUid
   * @returns {Promise<void>}
   */
  async clearStartToken(lobbyType, holderUid) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');

    const tokenPath = `lobbies/${lobbyType}/startToken`;
    const ref = dbMod.ref(db, tokenPath);

    await dbMod.runTransaction(ref, (current) => {
      // Só remove se ainda somos o holder
      if (current?.holderUid === holderUid) return null;
      return current; // não altera
    });

    console.log(`[StartToken] released lobbyType=${lobbyType} uid=${holderUid.slice(0, 8)}...`);
  }

  // -------------------------------------------------------
  // Assignments (atribuições de jogadores)
  // -------------------------------------------------------

  /**
   * Atribui um jogador a uma partida.
   * Path: /lobbies/{lobbyType}/assign/{uid}
   * @param {string} lobbyType
   * @param {string} uid
   * @param {Object} assignData - {matchId, ...}
   * @returns {Promise<void>}
   */
  async assignMatch(lobbyType, uid, assignData) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');
    
    const assignPath = `lobbies/${lobbyType}/assign/${uid}`;
    const ref = dbMod.ref(db, assignPath);
    await dbMod.set(ref, {
      ...assignData,
      assignedAt: Date.now(),
    });
  }

  /**
   * Obtém a atribuição de um jogador.
   * @param {string} lobbyType
   * @param {string} uid
   * @returns {Promise<Object|null>}
   */
  async getAssignment(lobbyType, uid) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');
    
    const assignPath = `lobbies/${lobbyType}/assign/${uid}`;
    const ref = dbMod.ref(db, assignPath);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : null;
  }

  /**
   * Remove a atribuição de um jogador.
   * @param {string} lobbyType
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async removeAssignment(lobbyType, uid) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');
    
    const assignPath = `lobbies/${lobbyType}/assign/${uid}`;
    const ref = dbMod.ref(db, assignPath);
    await dbMod.remove(ref);
  }

  /**
   * Escuta em tempo real a atribuição de um jogador.
   * Chama callback imediatamente e a cada mudança em /lobbies/{lobbyType}/assign/{uid}.
   * @param {string} lobbyType
   * @param {string} uid
   * @param {(assignment: Object|null) => void} callback
   * @returns {Function} unsubscribe
   */
  subscribeAssignment(lobbyType, uid, callback) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) {
      console.error('[LobbyRepository] Database não inicializado');
      return () => {};
    }

    const assignPath = `lobbies/${lobbyType}/assign/${uid}`;
    const ref = dbMod.ref(db, assignPath);

    const unsubscribe = dbMod.onValue(ref, (snap) => {
      callback(snap.exists() ? snap.val() : null);
    }, (error) => {
      console.error(`[LobbyRepository] Erro ao escutar assign (${lobbyType}/${uid}):`, error);
    });

    return unsubscribe;
  }

  /**
   * Remove o assign de um jogador, indicando que foi consumido pelo cliente.
   * Alias semântico de removeAssignment() com log de auditoria.
   * Path: /lobbies/{lobbyType}/assign/{uid}
   * @param {string} lobbyType
   * @param {string} uid
   * @returns {Promise<void>}
   */
  async clearAssignment(lobbyType, uid) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');

    const assignPath = `lobbies/${lobbyType}/assign/${uid}`;
    const ref = dbMod.ref(db, assignPath);
    await dbMod.remove(ref);
    console.log(`[Assign] cleared assignment uid=${uid}`);
  }

  // -------------------------------------------------------
  // Special: Multi lobby (tem timer)
  // -------------------------------------------------------

  /**
   * Define o deadline do lobby multi.
   * Path: /lobbies/multi/deadlineTs
   * @param {number} deadlineTs - timestamp do deadline
   * @returns {Promise<void>}
   */
  async setMultiDeadline(deadlineTs) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');
    
    const deadlinePath = 'lobbies/multi/deadlineTs';
    const ref = dbMod.ref(db, deadlinePath);
    await dbMod.set(ref, deadlineTs);
  }

  /**
   * Obtém o deadline do lobby multi.
   * @returns {Promise<number|null>}
   */
  async getMultiDeadline() {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');
    
    const deadlinePath = 'lobbies/multi/deadlineTs';
    const ref = dbMod.ref(db, deadlinePath);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : null;
  }

  /**
   * Obtém o timestamp do último join no multi.
   * Path: /lobbies/multi/lastJoinTs
   * @returns {Promise<number|null>}
   */
  async getMultiLastJoinTs() {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');
    
    const lastJoinPath = 'lobbies/multi/lastJoinTs';
    const ref = dbMod.ref(db, lastJoinPath);
    const snap = await dbMod.get(ref);
    return snap.exists() ? snap.val() : null;
  }

  /**
   * Define o timestamp do último join no multi.
   * @param {number} ts
   * @returns {Promise<void>}
   */
  async setMultiLastJoinTs(ts) {
    const db = this.#firebaseService.getDatabase();
    const dbMod = this.#firebaseService.getDbModules();
    if (!db) throw new Error('[LobbyRepository] Database não inicializado');
    
    const lastJoinPath = 'lobbies/multi/lastJoinTs';
    const ref = dbMod.ref(db, lastJoinPath);
    await dbMod.set(ref, ts);
  }

  // -------------------------------------------------------
  // Listener em tempo real para fila
  // -------------------------------------------------------

  /**
   * Observa contagem da fila em tempo real.
   * Chama cbCount(count) sempre que alguém entra ou sai.
   * Path: /lobbies/{lobbyType}/queue
   * @param {string} lobbyType - ex: '2p', '6p', 'tournament'
   * @param {(count: number) => void} cbCount
   * @returns {Function} unsubscribe
   */
  subscribeQueue(lobbyType, cbCount) {
    const db    = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();

    if (!db || !dbMod) {
      console.error('[LobbyRepository.subscribeQueue] Database não inicializado');
      return () => {};
    }

    const path     = `lobbies/${lobbyType}/queue`;
    const queueRef = dbMod.ref(db, path);

    console.log(`[Queue] subscribe lobbyType=${lobbyType} path=${path}`);

    // Entradas mais antigas que 10 min sem atualização são consideradas órfãs
    const STALE_THRESHOLD_MS = 10 * 60 * 1000;

    const unsub = dbMod.onValue(
      queueRef,
      (snap) => {
        const data = snap.exists() ? snap.val() : {};
        const now  = Date.now();
        let count  = 0;

        for (const [uid, entry] of Object.entries(data)) {
          const joinedAt = entry?.joinedAt ?? 0;
          if (now - joinedAt > STALE_THRESHOLD_MS) {
            // Remove entrada órfã silenciosamente
            const staleRef = dbMod.ref(db, `lobbies/${lobbyType}/queue/${uid}`);
            dbMod.remove(staleRef).catch(() => {});
            console.warn(`[Queue] removeu entrada órfã lobbyType=${lobbyType} uid=${uid}`);
          } else {
            count++;
          }
        }

        console.log(`[Queue] lobbyType=${lobbyType} count=${count}`);
        cbCount(count);
      },
      (err) => {
        console.error(`[Queue] error lobbyType=${lobbyType}`, err);
      }
    );

    return () => {
      unsub();
      console.log(`[Queue] unsubscribed lobbyType=${lobbyType}`);
    };
  }

  /**
   * Observa mudanças na fila em tempo real (onValue).
   * Path: /lobbies/{lobbyType}/queue
   * @param {string} lobbyType
   * @param {(users: Object) => void} onUpdate - callback com usuários atualizados
   * @returns {Function} unsubscribe function
   */
  subscribeQueueUsers(lobbyType, onUpdate) {
    const db = this.#firebaseService?.getDatabase?.();
    const dbMod = this.#firebaseService?.getDbModules?.();
    
    if (!db) {
      console.error('[LobbyRepository.subscribeQueueUsers] Database não inicializado');
      return () => {};
    }

    const queuePath = `lobbies/${lobbyType}/queue`;
    const queueRef = dbMod.ref(db, queuePath);

    console.log(`[Queue] Listener iniciado para lobbyType="${lobbyType}" em path="${queuePath}"`);

    const STALE_THRESHOLD_MS = 10 * 60 * 1000;

    // Listener em tempo real
    const unsubscribe = dbMod.onValue(queueRef, (snapshot) => {
      const rawUsers = snapshot.exists() ? snapshot.val() : {};
      const now = Date.now();
      const users = {};

      for (const [uid, entry] of Object.entries(rawUsers)) {
        const joinedAt = entry?.joinedAt ?? 0;
        if (now - joinedAt > STALE_THRESHOLD_MS) {
          const staleRef = dbMod.ref(db, `${queuePath}/${uid}`);
          dbMod.remove(staleRef).catch(() => {});
          console.warn(`[Queue] removeu entrada órfã lobbyType=${lobbyType} uid=${uid}`);
        } else {
          users[uid] = entry;
        }
      }

      const count = Object.keys(users).length;
      console.log(`[Queue] Atualizado: ${count} usuários em ${lobbyType}`, users);
      
      onUpdate(users);
    }, (error) => {
      console.error(`[QueueError] Erro ao ouvir fila (${lobbyType}):`, error);
    });

    // Retorna função para unsubscribe
    return () => {
      unsubscribe();
      console.log(`[Queue] Listener encerrado para lobbyType="${lobbyType}"`);
    };
  }
}
