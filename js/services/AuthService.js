/**
 * @layer services
 * @group auth
 * @role Service
 * @depends UserRepository
 * @exports AuthService
 *
 * Serviço de autenticação: expõe casos de uso de auth para as Screens.
 * Faz a ponte entre a camada de UI (screens) e o repositório de dados.
 *
 * Regras de camadas:
 *   - Screens → AuthService  ✔ (permitido)
 *   - Screens → UserRepository ✗ (proibido)
 *   - Screens → FirebaseService ✗ (proibido)
 */
import { UserRepository } from '../repositories/UserRepository.js';

export class AuthService {
  /** @type {AuthService|null} */
  static #instance = null;

  /** @type {UserRepository} */
  #repo;

  constructor() {
    this.#repo = UserRepository.getInstance();
  }

  // -------------------------------------------------------
  // Singleton
  // -------------------------------------------------------

  static getInstance() {
    if (!AuthService.#instance) {
      AuthService.#instance = new AuthService();
    }
    return AuthService.#instance;
  }

  // -------------------------------------------------------
  // Casos de uso
  // -------------------------------------------------------

  /**
   * Login com email e senha.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<import('../repositories/UserRepository.js').UserDTO>}
   */
  async signIn(email, password) {
    return this.#repo.signIn(email, password);
  }

  /**
   * Criação de conta com email e senha.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<import('../repositories/UserRepository.js').UserDTO>}
   */
  async signUp(email, password) {
    return this.#repo.signUp(email, password);
  }

  /**
   * Login com popup do Google.
   * @returns {Promise<import('../repositories/UserRepository.js').UserDTO>}
   */
  async signInWithGoogle() {
    return this.#repo.signInWithGoogle();
  }

  /**
   * Logout do usuário atual.
   * @returns {Promise<void>}
   */
  async signOut() {
    return this.#repo.signOut();
  }

  /**
   * Alias para signOut() (interface alternativa).
   * @returns {Promise<void>}
   */
  async logout() {
    return this.signOut();
  }

  /**
   * Obtém o usuário atual (se logado).
   * @returns {Promise<import('../repositories/UserRepository.js').UserDTO|null>}
   */
  async getCurrentUser() {
    return this.#repo.getCurrentUser();
  }

  /**
   * Observa mudanças de estado de autenticação.
   * @param {(user: import('../repositories/UserRepository.js').UserDTO|null) => void} callback
   * @returns {Function} — chame para cancelar
   */
  onAuthStateChanged(callback) {
    return this.#repo.onAuthStateChanged(callback);
  }

  /**
   * Carrega o perfil do usuário do RTDB.
   * Nunca lança — retorna UserProfile default se não encontrado.
   * @param {string} uid
   * @returns {Promise<import('../domain/UserProfile.js').UserProfile>}
   */
  async getProfile(uid) {
    return this.#repo.getProfile(uid);
  }

  /**
   * Garante que o perfil exista no RTDB. Cria default se não existir.
   * Deve ser chamado após qualquer login ou cadastro.
   * @param {Object} fbUser - { uid, email, displayName?, photoURL? }
   * @param {Object} [extra] - { name?, age?, avatarUrl? }
   * @returns {Promise<import('../domain/UserProfile.js').UserProfile>}
   */
  async ensureProfile(fbUser, extra = {}) {
    return this.#repo.ensureProfile(fbUser, extra);
  }

  /**
   * Salva/atualiza campos do perfil no RTDB.
   * @param {string} uid
   * @param {Object} data
   * @returns {Promise<import('../domain/UserProfile.js').UserProfile>}
   */
  async saveProfile(uid, data) {
    return this.#repo.saveProfile(uid, data);
  }

  /**
   * Envia e-mail de redefinição de senha.
   * @param {string} email
   * @returns {Promise<void>}
   */
  async sendPasswordResetEmail(email) {
    return this.#repo.sendPasswordResetEmail(email);
  }

  /**
   * Envia e-mail de verificação ao usuário atual (chamar após signUp).
   * @returns {Promise<void>}
   */
  async sendEmailVerification() {
    return this.#repo.sendEmailVerification();
  }

  /**
   * Retorna se o e-mail do usuário atual foi verificado.
   * @returns {boolean}
   */
  isEmailVerified() {
    return this.#repo.isEmailVerified();
  }
}
