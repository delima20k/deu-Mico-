/**
 * @layer   services
 * @group   firebase
 * @role    service
 * @depends FirebaseConfig
 * @exports FirebaseService
 *
 * Serviço de baixo nível: inicializa o Firebase App e Firebase Auth
 * via SDK modular v9 carregado dinamicamente da CDN (sem npm).
 *
 * Responsabilidades:
 *   - init()              → carrega SDK, valida config, cria app + auth
 *   - getApp()            → expõe a instância do Firebase App
 *   - getAuth()           → expõe a instância do Firebase Auth
 *   - signInEmail()       → login com e-mail e senha
 *   - signUpEmail()       → cadastro com e-mail e senha
 *   - signInGooglePopup() → login via popup do Google
 *   - signOut()           → encerra sessão
 *   - onAuthStateChanged()→ observador de estado de autenticação
 *
 * Regra de camadas:
 *   Screens → AuthService → UserRepository → FirebaseService ← (aqui)
 *   Screens NÃO acessam FirebaseService diretamente.
 */
import { FirebaseConfig } from './firebaseConfig.js';

export class FirebaseService {
  /** @type {FirebaseService|null} */
  static #instance = null;

  /** URL base do Firebase CDN (modular v9) */
  static #FB_CDN = 'https://www.gstatic.com/firebasejs/10.11.1';

  /** @type {boolean} */
  #initialized = false;

  /** @type {boolean} */
  #configured = false;

  /** @type {*} auth instance */
  #auth = null;

  /** @type {*} Firebase app instance */
  #app = null;

  /** @type {*} RTDB database instance */
  #database = null;

  /** @type {*} Firebase Storage instance */
  #storage = null;

  /** @type {*} Módulos carregados dinamicamente */
  #mod = null;

  /** @type {*} Módulos do Storage carregados dinamicamente */
  #storageMod = null;

  /** @type {number|null} Timer do heartbeat periódico */
  #heartbeatTimer = null;

  /** @type {Function|null} Unsubscriber do monitor de conexão Firebase */
  #connUnsubscribe = null;

  // -------------------------------------------------------
  // Singleton
  // -------------------------------------------------------
  static getInstance() {
    if (!FirebaseService.#instance) {
      FirebaseService.#instance = new FirebaseService();
    }
    return FirebaseService.#instance;
  }

  // -------------------------------------------------------
  // Inicialização
  // -------------------------------------------------------

  /**
   * Carrega o SDK do Firebase e inicializa o app.
   * Deve ser chamado uma vez no App.js.
   * @returns {Promise<void>}
   */
  async init() {
    if (this.#initialized) return;

    // Valida config antes de tentar inicializar
    this.#configured = FirebaseConfig.isConfigured();
    const cfg = FirebaseConfig.get();

    if (!this.#configured) {
      console.warn('[FirebaseService] firebaseConfig.js não preenchido — Auth desativado.');
      this.#initialized = true;
      return;
    }

    try {
      // Carrega SDK modular v9 via CDN (dynamic import)
      const [appMod, authMod, dbMod, storageMod] = await Promise.all([
        import(`${FirebaseService.#FB_CDN}/firebase-app.js`),
        import(`${FirebaseService.#FB_CDN}/firebase-auth.js`),
        import(`${FirebaseService.#FB_CDN}/firebase-database.js`),
        import(`${FirebaseService.#FB_CDN}/firebase-storage.js`),
      ]);

      this.#app      = appMod.initializeApp(cfg);
      this.#auth     = authMod.getAuth(this.#app);
      this.#database = dbMod.getDatabase(this.#app);
      this.#storage  = storageMod.getStorage(this.#app);

      // Guarda módulos para uso nos métodos
      this.#mod        = { ...authMod, ...dbMod };
      this.#storageMod = storageMod;

      this.#initialized = true;
      console.info('[FirebaseService] Firebase inicializado com sucesso.');
    } catch (err) {
      console.error('[FirebaseService] Falha ao inicializar Firebase:', err);
      this.#initialized = true; // marca para não tentar de novo
    }
  }

  // -------------------------------------------------------
  // Auth — Email / Senha
  // -------------------------------------------------------

  /**
   * Faz login com email e senha.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ email: string, displayName: string|null, uid: string }>}
   */
  async signInEmail(email, password) {
    this.#assertReady();
    const cred = await this.#mod.signInWithEmailAndPassword(this.#auth, email, password);
    return this.#mapUser(cred.user);
  }

  /**
   * Cria conta com email e senha.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ email: string, displayName: string|null, uid: string }>}
   */
  async signUpEmail(email, password) {
    this.#assertReady();
    const cred = await this.#mod.createUserWithEmailAndPassword(this.#auth, email, password);
    return this.#mapUser(cred.user);
  }

  // -------------------------------------------------------
  // Auth — Google
  // -------------------------------------------------------

  /**
   * Abre popup de login com Google.
   * @returns {Promise<{ email: string, displayName: string|null, uid: string }>}
   */
  async signInGooglePopup() {
    this.#assertReady();
    const provider = new this.#mod.GoogleAuthProvider();
    const cred = await this.#mod.signInWithPopup(this.#auth, provider);
    return this.#mapUser(cred.user);
  }

  // -------------------------------------------------------
  // Acesso às instâncias internas (para uso avançado)
  // -------------------------------------------------------

  /**
   * Retorna a instância do Firebase App.
   * Disponível apenas após init() bem-sucedido.
   * @returns {*|null}
   */
  getApp() {
    return this.#app;
  }

  /**
   * Retorna a instância do Firebase Auth.
   * Disponível apenas após init() bem-sucedido.
   * @returns {*|null}
   */
  getAuth() {
    return this.#auth;
  }

  /**
   * Retorna a instância do Firebase Realtime Database.
   * Disponível apenas após init() bem-sucedido.
   * @returns {*|null}
   */
  getDatabase() {
    return this.#database;
  }

  /**
   * Retorna a instância do Firebase Storage.
   * @returns {*|null}
   */
  getStorage() {
    return this.#storage;
  }

  /**
   * Retorna os módulos do Firebase Storage (ref, uploadBytes, getDownloadURL, etc).
   * @returns {Object|null}
   */
  getStorageModules() {
    return this.#storageMod;
  }

  /**
   * Retorna os módulos do Firebase (para ref, set, get, etc).
   * @returns {Object}
   */
  getDbModules() {
    return this.#mod;
  }

  // -------------------------------------------------------
  // Auth — Sign Out
  // -------------------------------------------------------

  /** @returns {Promise<void>} */
  async signOut() {
    if (!this.#auth) return;
    await this.#mod.signOut(this.#auth);
  }

  // -------------------------------------------------------
  // Auth — Observer
  // -------------------------------------------------------

  /**
   * Registra callback para mudanças de estado de autenticação.
   * @param {(user: object|null) => void} callback
   * @returns {Function} — chame para cancelar a inscrição
   */
  onAuthStateChanged(callback) {
    if (!this.#auth) {
      // Sem Firebase: informa imediatamente que não há usuário
      callback(null);
      return () => {};
    }
    return this.#mod.onAuthStateChanged(this.#auth, (user) => {
      callback(user ? this.#mapUser(user) : null);
    });
  }

  /**
   * Obtém o usuário atualmente autenticado (se houver).
   * Aguarda o Firebase restaurar a sessão do localStorage via onAuthStateChanged,
   * evitando retorno null imediato após recarregar a página.
   * @returns {Promise<object|null>}
   */
  async getCurrentUser() {
    if (!this.#auth) return null;
    return new Promise((resolve) => {
      const unsubscribe = this.#mod.onAuthStateChanged(this.#auth, (user) => {
        unsubscribe();
        resolve(user ? this.#mapUser(user) : null);
      });
    });
  }

  // -------------------------------------------------------
  // Privado
  // -------------------------------------------------------

  /**
   * Lança erro amigável se o Firebase não estiver configurado.
   */
  #assertReady() {
    if (!this.#initialized) {
      const err = new Error('Chame FirebaseService.init() antes de usar Auth.');
      err.code = 'auth/not-configured';
      throw err;
    }
    if (!this.#configured || !this.#auth) {
      const err = new Error('Firebase não configurado. Preencha firebaseConfig.js.');
      err.code = 'auth/not-configured';
      throw err;
    }
  }

  /**
   * Normaliza objeto de usuário do Firebase.
   * @param {*} fbUser
   * @returns {{ email: string, displayName: string|null, uid: string, photoURL: string|null }}
   */
  #mapUser(fbUser) {
    return {
      uid:         fbUser.uid,
      email:       fbUser.email,
      displayName: fbUser.displayName || null,
      photoURL:    fbUser.photoURL || null,
    };
  }

  // -------------------------------------------------------
  // Heartbeat — Mantém WebSocket ativo no Android PWA
  // -------------------------------------------------------

  /**
   * Inicia ping periódico para manter o WebSocket do RTDB ativo.
   * Especialmente útil no Android PWA que pode suspender conexões em background.
   * Monitora .info/connected para logar reconexões e atualizar lastSeen.
   * @param {string} matchId
   * @param {string} uid
   */
  startHeartbeat(matchId, uid) {
    this.stopHeartbeat();

    const db    = this.#database;
    const dbMod = this.#mod;
    if (!db || !dbMod) {
      console.warn('[Heartbeat] Firebase não inicializado — heartbeat não iniciado');
      return;
    }

    // Monitora estado de conexão: loga e atualiza lastSeen ao reconectar
    const connRef = dbMod.ref(db, '.info/connected');
    this.#connUnsubscribe = dbMod.onValue(connRef, (snap) => {
      const connected = snap.val();
      console.log(`[Heartbeat] Firebase ${connected ? '✅ conectado' : '❌ desconectado'}`);
      if (connected) {
        const lastSeenRef = dbMod.ref(db, `matches/${matchId}/presence/${uid}/lastSeen`);
        dbMod.set(lastSeenRef, Date.now()).catch(() => {});
      }
    });

    // Ping periódico a cada 15s: escreve timestamp no nó heartbeat
    this.#heartbeatTimer = setInterval(async () => {
      try {
        const heartbeatRef = dbMod.ref(db, `matches/${matchId}/presence/${uid}/heartbeat`);
        await dbMod.set(heartbeatRef, Date.now());
        console.log('[Heartbeat] ✓ ping enviado');
      } catch (e) {
        console.warn('[Heartbeat] Falha no ping:', e.message);
      }
    }, 15_000);

    console.log(`[Heartbeat] iniciado — matchId=${matchId} uid=${uid.slice(0, 8)}...`);
  }

  /**
   * Para o heartbeat e o monitor de conexão.
   * Deve ser chamado em GameTableScreen.onExit().
   */
  stopHeartbeat() {
    if (this.#heartbeatTimer) {
      clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
    if (this.#connUnsubscribe) {
      this.#connUnsubscribe();
      this.#connUnsubscribe = null;
    }
    console.log('[Heartbeat] parado');
  }
}
