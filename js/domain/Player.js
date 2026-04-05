/**
 * @layer    domain
 * @group    game
 * @role     Model
 * @depends  —
 * @exports  Player
 *
 * Modelo de domínio para um jogador participante de uma partida.
 * Encapsula identidade, idade e posição de entrada na sala.
 * Sem acesso ao DOM, sem chamadas externas — domínio puro.
 *
 * Diferença de UserProfile:
 *   UserProfile → dado persistente do cadastro (Firebase Auth/Firestore)
 *   Player      → dado de jogo, válido apenas no contexto de uma partida
 *
 * Cálculo de idade:
 *   1. Se birthDate estiver disponível → calcula anos completos em relação à data atual.
 *   2. Senão, usa o campo age (fornecido pelo cadastro).
 *   3. Ambos ausentes → Infinity (nunca será o mais novo).
 */
export class Player {
  /** @type {string} Identificador único — igual ao UID do Firebase */
  #id;

  /** @type {string} Nome legível do jogador */
  #name;

  /** @type {number|null} Idade em anos (campo de cadastro, pode ser null) */
  #age;

  /** @type {Date|null} Data de nascimento (mais precisa que #age para cálculo) */
  #birthDate;

  /** @type {number} Timestamp (ms) em que o jogador entrou na sala */
  #joinedAt;

  /**
   * @param {Object}      cfg
   * @param {string}      cfg.id            - UID Firebase
   * @param {string}      cfg.name          - Nome do jogador
   * @param {number|null} [cfg.age=null]    - Idade declarada no cadastro
   * @param {Date|string|null} [cfg.birthDate=null] - Data de nascimento
   * @param {number}      [cfg.joinedAt=0]  - Timestamp de entrada na sala (ms)
   */
  constructor({ id, name, age = null, birthDate = null, joinedAt = 0 }) {
    if (!id) throw new Error('[Player] id é obrigatório.');

    this.#id       = String(id);
    this.#name     = name || 'Jogador';
    this.#age      = (age !== null && age !== undefined) ? Number(age) : null;
    this.#joinedAt = Number(joinedAt) || 0;

    if (birthDate) {
      const d = birthDate instanceof Date ? birthDate : new Date(birthDate);
      this.#birthDate = isNaN(d.getTime()) ? null : d;
    } else {
      this.#birthDate = null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────────────────────

  get id()        { return this.#id; }

  /**
   * Alias de `id` para compatibilidade com o padrão uid do Firebase/UserProfile.
   * @returns {string}
   */
  get uid()       { return this.#id; }

  get name()      { return this.#name; }
  get age()       { return this.#age; }
  get birthDate() { return this.#birthDate; }
  get joinedAt()  { return this.#joinedAt; }

  /**
   * Idade resolvida para comparação.
   *
   * Prioridade:
   *   1. birthDate → calcula anos completos em relação a hoje (mais preciso).
   *   2. age       → valor declarado no cadastro.
   *   3. Ambos ausentes → Infinity (jogador nunca será escolhido como mais novo).
   *
   * @returns {number}
   */
  get resolvedAge() {
    if (this.#birthDate) {
      const today = new Date();
      let years = today.getFullYear() - this.#birthDate.getFullYear();
      const monthDiff = today.getMonth() - this.#birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < this.#birthDate.getDate())) {
        years--;
      }
      return years;
    }

    if (this.#age !== null && Number.isFinite(this.#age)) return this.#age;
    return Infinity;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Factory methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Cria um Player a partir de um UserProfile.
   *
   * @param {import('./UserProfile.js').UserProfile} profile
   * @param {{ joinedAt?: number }} [opts]
   * @returns {Player}
   */
  static fromProfile(profile, { joinedAt = 0 } = {}) {
    return new Player({
      id:        profile.uid,
      name:      profile.name,
      age:       profile.age ?? null,
      birthDate: profile.birthDate ?? null,
      joinedAt,
    });
  }

  /**
   * Cria um Player a partir de um objeto participante raw da sala.
   * Formato mínimo: `{ uid, name?, joinedAt? }`.
   *
   * @param {{ uid: string, name?: string, joinedAt?: number }} participant
   * @returns {Player}
   */
  static fromParticipant({ uid, name = 'Jogador', joinedAt = 0 }) {
    return new Player({ id: uid, name, joinedAt });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Serialização
  // ─────────────────────────────────────────────────────────────────────────

  toJSON() {
    return {
      id:        this.#id,
      name:      this.#name,
      age:       this.#age,
      birthDate: this.#birthDate ? this.#birthDate.toISOString() : null,
      joinedAt:  this.#joinedAt,
    };
  }

  toString() {
    return `Player(id=${this.#id}, name=${this.#name}, resolvedAge=${this.resolvedAge})`;
  }
}
