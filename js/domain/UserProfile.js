/**
 * @layer    domain
 * @group    user
 * @role     Domain
 * @depends  —
 * @exports  UserProfile
 *
 * Modelo de domínio para o perfil do usuário.
 * Encapsula dados: uid, email, name, age, avatarUrl.
 * Sem acesso a DOM, sem chamadas externas.
 * 100% imutável via getters.
 */
export class UserProfile {
  /** @type {string} UID do Firebase */
  #uid;

  /** @type {string} E-mail do usuário */
  #email;

  /** @type {string} Nome do usuário */
  #name;

  /** @type {number} Idade do usuário (6-120) */
  #age;

  /** @type {string|null} URL do avatar */
  #avatarUrl;

  /**
   * @param {Object} data
   * @param {string} data.uid
   * @param {string} data.email
   * @param {string} [data.name='']
   * @param {number} [data.age=null]
   * @param {string|null} [data.avatarUrl=null]
   */
  constructor({ uid, email, name = '', age = null, avatarUrl = null }) {
    this.#uid       = uid;
    this.#email     = email;
    this.#name      = name;
    this.#age       = age;
    this.#avatarUrl = avatarUrl;
  }

  // -------------------------------------------------------
  // Getters (imutáveis)
  // -------------------------------------------------------

  get uid()       { return this.#uid; }
  get email()     { return this.#email; }
  get name()      { return this.#name; }
  get age()       { return this.#age; }
  get avatarUrl() { return this.#avatarUrl; }

  // -------------------------------------------------------
  // Métodos de cópia com atualização
  // -------------------------------------------------------

  /**
   * Cria nova instância com campos atualizados.
   * @param {Partial<{name: string, age: number, avatarUrl: string}>} updates
   * @returns {UserProfile}
   */
  withUpdates(updates) {
    return new UserProfile({
      uid:       this.#uid,
      email:     this.#email,
      name:      updates.name ?? this.#name,
      age:       updates.age ?? this.#age,
      avatarUrl: updates.avatarUrl ?? this.#avatarUrl,
    });
  }

  /**
   * Serializa para enviar ao Firebase (eventual).
   * @returns {Object}
   */
  toJSON() {
    return {
      uid:       this.#uid,
      email:     this.#email,
      name:      this.#name,
      age:       this.#age,
      avatarUrl: this.#avatarUrl,
    };
  }

  /**
   * Factory method: cria from Firebase User + dados customizados.
   * @param {Object} fbUser - { uid, email, displayName? }
   * @param {Object} [custom] - { name?, age?, avatarUrl? }
   * @returns {UserProfile}
   */
  static fromFirebase(fbUser, custom = {}) {
    return new UserProfile({
      uid:       fbUser.uid,
      email:     fbUser.email,
      name:      custom.name || fbUser.displayName || '',
      age:       custom.age || null,
      avatarUrl: custom.avatarUrl || fbUser.photoURL || null,
    });
  }
}
