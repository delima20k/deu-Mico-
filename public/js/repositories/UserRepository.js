/**
 * @layer repositories
 * @group auth
 * @role Repository
 * @depends FirebaseService
 * @exports UserRepository
 *
 * Repositório de usuário: camada entre serviços externos (FirebaseService)
 * e a lógica da aplicação. Transforma respostas cruas do Firebase em
 * objetos de usuário normalizados, e centraliza toda lógica de acesso
 * a dados do usuário.
 *
 * Regra de camadas:
 *   - Screens NÃO importam UserRepository diretamente.
 *   - Screens usam AuthService, que usa UserRepository.
 */
import { FirebaseService } from '../services/FirebaseService.js';
import { UserProfile } from '../domain/UserProfile.js';

export class UserRepository {
  /** @type {UserRepository|null} */
  static #instance = null;

  /** @type {FirebaseService} */
  #service;

  constructor() {
    this.#service = FirebaseService.getInstance();
  }

  // -------------------------------------------------------
  // Singleton
  // -------------------------------------------------------

  static getInstance() {
    if (!UserRepository.#instance) {
      UserRepository.#instance = new UserRepository();
    }
    return UserRepository.#instance;
  }

  // -------------------------------------------------------
  // Escrita
  // -------------------------------------------------------

  /**
   * Autentica usuário com email e senha.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<UserDTO>}
   */
  async signIn(email, password) {
    return this.#service.signInEmail(email, password);
  }

  /**
   * Cria conta com email e senha.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<UserDTO>}
   */
  async signUp(email, password) {
    return this.#service.signUpEmail(email, password);
  }

  /**
   * Autentica via popup do Google.
   * @returns {Promise<UserDTO>}
   */
  async signInWithGoogle() {
    return this.#service.signInGooglePopup();
  }

  /**
   * Encerra a sessão do usuário atual.
   * @returns {Promise<void>}
   */
  async signOut() {
    return this.#service.signOut();
  }

  // -------------------------------------------------------
  // Leitura / Observação
  // -------------------------------------------------------

  /**
   * Obtém o usuário atualmente autenticado (se houver).
   * @returns {Promise<UserDTO|null>}
   */
  async getCurrentUser() {
    return this.#service.getCurrentUser();
  }

  /**
   * Obtém o perfil de um usuário pelo UID.
   * Lê de /users/{uid}/profile. Retorna UserProfile default se não existir.
   * @param {string} uid
   * @returns {Promise<UserProfile>}
   */
  async getProfile(uid) {
    if (!uid) return new UserProfile({ uid: '', email: '', name: 'Jogador', age: null, avatarUrl: null });

    const db = this.#service.getDatabase();
    const dbMod = this.#service.getDbModules();

    if (!db) {
      console.error('[UserRepository] Database não inicializado');
      return new UserProfile({ uid, email: '', name: 'Jogador', age: null, avatarUrl: null });
    }

    try {
      // Tenta ler /users/{uid}/profile (caminho principal)
      const profileRef = dbMod.ref(db, `users/${uid}/profile`);
      const snap = await dbMod.get(profileRef);

      if (snap.exists()) {
        const data = snap.val();
        console.log(`[Profile] loaded uid=${uid.slice(0, 8)}...`);
        return new UserProfile({
          uid,
          email:     data.email     || '',
          name:      data.name      || 'Jogador',
          age:       data.age       ?? null,
          avatarUrl: data.avatarUrl || null,
        });
      }

      // Fallback: tenta ler raíz /users/{uid} (legado)
      const rootRef = dbMod.ref(db, `users/${uid}`);
      const rootSnap = await dbMod.get(rootRef);
      if (rootSnap.exists()) {
        const data = rootSnap.val();
        console.log(`[Profile] loaded (legacy) uid=${uid.slice(0, 8)}...`);
        return new UserProfile({
          uid,
          email:     data.email     || '',
          name:      data.displayName || data.name || 'Jogador',
          age:       data.age       ?? null,
          avatarUrl: data.photoURL  || data.avatarUrl || null,
        });
      }

      console.warn(`[Profile] não encontrado para uid=${uid.slice(0, 8)}... retornando default`);
      return new UserProfile({ uid, email: '', name: 'Jogador', age: null, avatarUrl: null });
    } catch (error) {
      console.error(`[UserRepository] Erro ao buscar perfil de ${uid}:`, error);
      return new UserProfile({ uid, email: '', name: 'Jogador', age: null, avatarUrl: null });
    }
  }

  /**
   * Atualiza apenas o campo avatarUrl do perfil.
   * Atalho para saveProfile(uid, { avatarUrl }).
   * @param {string} uid
   * @param {string} url - downloadURL do Firebase Storage
   * @returns {Promise<void>}
   */
  async updateAvatarUrl(uid, url) {
    await this.saveProfile(uid, { avatarUrl: url });
    console.log(`[Profile] avatarUrl saved uid=${uid.slice(0, 8)}...`);
  }

  /**
   * Salva (ou atualiza) o perfil em /users/{uid}/profile.
   * @param {string} uid
   * @param {Object} data - { name?, age?, avatarUrl?, email? }
   * @returns {Promise<UserProfile>}
   */
  async saveProfile(uid, data) {
    const db = this.#service.getDatabase();
    const dbMod = this.#service.getDbModules();
    if (!db) throw new Error('[UserRepository] Database não inicializado');

    const now = Date.now();
    const profileRef = dbMod.ref(db, `users/${uid}/profile`);

    // Lê valor atual para preservar campos existentes
    const snap = await dbMod.get(profileRef);
    const existing = snap.exists() ? snap.val() : {};

    const updated = {
      ...existing,
      uid,
      email:     data.email     ?? existing.email     ?? '',
      name:      data.name      ?? existing.name      ?? 'Jogador',
      age:       data.age       ?? existing.age       ?? null,
      avatarUrl: data.avatarUrl ?? existing.avatarUrl ?? null,
      updatedAt: now,
      createdAt: existing.createdAt ?? now,
    };

    await dbMod.set(profileRef, updated);
    console.log(`[Profile] updated uid=${uid.slice(0, 8)}...`);

    return new UserProfile({
      uid,
      email:     updated.email,
      name:      updated.name,
      age:       updated.age,
      avatarUrl: updated.avatarUrl,
    });
  }

  /**
   * Garante que o perfil exista no RTDB. Se não existir, cria default.
   * Chamado após qualquer login/cadastro.
   * @param {Object} fbUser - { uid, email, displayName?, photoURL? }
   * @param {Object} [extra] - { name?, age?, avatarUrl? }
   * @returns {Promise<UserProfile>}
   */
  async ensureProfile(fbUser, extra = {}) {
    if (!fbUser?.uid) throw new Error('[UserRepository] fbUser.uid obrigatório');

    const db = this.#service.getDatabase();
    const dbMod = this.#service.getDbModules();
    if (!db) throw new Error('[UserRepository] Database não inicializado');

    const profileRef = dbMod.ref(db, `users/${fbUser.uid}/profile`);
    const snap = await dbMod.get(profileRef);

    if (snap.exists()) {
      // Já existe: atualiza apenas se extra tiver dados novos
      if (Object.keys(extra).length > 0) {
        return this.saveProfile(fbUser.uid, extra);
      }
      const data = snap.val();
      console.log(`[Profile] loaded uid=${fbUser.uid.slice(0, 8)}...`);
      return new UserProfile({
        uid:      fbUser.uid,
        email:    data.email     || fbUser.email || '',
        name:     data.name      || 'Jogador',
        age:      data.age       ?? null,
        avatarUrl:data.avatarUrl || null,
      });
    }

    // Perfil não existe: cria default
    const now = Date.now();
    const defaultProfile = {
      uid:      fbUser.uid,
      email:    fbUser.email || '',
      name:     extra.name || fbUser.displayName || fbUser.email?.split('@')[0] || 'Jogador',
      age:      extra.age ?? null,
      avatarUrl:extra.avatarUrl || fbUser.photoURL || null,
      createdAt: now,
      updatedAt: now,
    };

    await dbMod.set(profileRef, defaultProfile);
    console.log(`[Profile] created default uid=${fbUser.uid.slice(0, 8)}...`);

    return new UserProfile({
      uid:      fbUser.uid,
      email:    defaultProfile.email,
      name:     defaultProfile.name,
      age:      defaultProfile.age,
      avatarUrl:defaultProfile.avatarUrl,
    });
  }

  /**
   * Registra callback para mudanças de estado de autenticação.
   * @param {(user: UserDTO|null) => void} callback
   * @returns {Function} — chame para cancelar a inscrição
   */
  onAuthStateChanged(callback) {
    return this.#service.onAuthStateChanged(callback);
  }

  /**
   * Envia e-mail de redefinição de senha.
   * @param {string} email
   * @returns {Promise<void>}
   */
  async sendPasswordResetEmail(email) {
    return this.#service.sendPasswordResetEmail(email);
  }

  /**
   * Envia e-mail de verificação ao usuário atual.
   * @returns {Promise<void>}
   */
  async sendEmailVerification() {
    return this.#service.sendEmailVerification();
  }

  /**
   * Retorna se o e-mail do usuário atual foi verificado.
   * @returns {boolean}
   */
  isEmailVerified() {
    return this.#service.isEmailVerified();
  }
}

/**
 * @typedef {{ uid: string, email: string, displayName: string|null }} UserDTO
 */
