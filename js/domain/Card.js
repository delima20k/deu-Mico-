/**
 * @layer    domain
 * @group    deck
 * @role     Model
 * @depends  —
 * @exports  Card
 *
 * Modelo imutável de uma carta individual do baralho "Deu Mico".
 * Encapsula identidade, aparência, estado de jogo e posse.
 * Sem acesso a DOM, sem chamadas externas — domínio puro.
 */
export class Card {
  /** @type {string} ID único global da carta (ex: 'jacare_A', 'mico_1') */
  #id;

  /** @type {string} ID do par — ambas as cartas de um par compartilham o mesmo pairId */
  #pairId;

  /** @type {string} Nome legível da carta (ex: 'Jacaré') */
  #name;

  /** @type {string} Caminho relativo da imagem da face (ex: 'img/carta_jacare.png') */
  #faceImage;

  /** @type {string} Caminho relativo da imagem do verso */
  #backImage;

  /** @type {boolean} Indica se é a carta única do Mico */
  #isMico;

  /** @type {boolean} Indica se a carta está virada para cima */
  #isFaceUp;

  /** @type {boolean} Indica se o par foi formado e as cartas foram descartadas */
  #isMatched;

  /** @type {string|null} UID do jogador que possui esta carta na mão */
  #ownerPlayerId;

  /** @type {number} Posição da carta no baralho após embaralhamento */
  #orderIndex;

  /**
   * @param {Object}      cfg
   * @param {string}      cfg.id            - ID único da carta
   * @param {string}      cfg.pairId        - ID do par
   * @param {string}      cfg.name          - Nome legível
   * @param {string}      cfg.faceImage     - Caminho da imagem da face
   * @param {string}      cfg.backImage     - Caminho da imagem do verso
   * @param {boolean}     [cfg.isMico=false]        - Carta especial do Mico
   * @param {boolean}     [cfg.isFaceUp=false]      - Começa virada para baixo
   * @param {boolean}     [cfg.isMatched=false]     - Par ainda não formado
   * @param {string|null} [cfg.ownerPlayerId=null]  - Sem dono inicial
   * @param {number}      [cfg.orderIndex=0]        - Será ajustado pelo shuffle
   */
  constructor({
    id,
    pairId,
    name,
    faceImage,
    backImage,
    isMico       = false,
    isFaceUp     = false,
    isMatched    = false,
    ownerPlayerId = null,
    orderIndex   = 0,
  }) {
    if (!id)        throw new Error('[Card] id é obrigatório.');
    if (!pairId)    throw new Error('[Card] pairId é obrigatório.');
    if (!name)      throw new Error('[Card] name é obrigatório.');
    if (!faceImage) throw new Error('[Card] faceImage é obrigatório.');
    if (!backImage) throw new Error('[Card] backImage é obrigatório.');

    this.#id            = id;
    this.#pairId        = pairId;
    this.#name          = name;
    this.#faceImage     = faceImage;
    this.#backImage     = backImage;
    this.#isMico        = isMico;
    this.#isFaceUp      = isFaceUp;
    this.#isMatched     = isMatched;
    this.#ownerPlayerId = ownerPlayerId;
    this.#orderIndex    = orderIndex;
  }

  // -------------------------------------------------------
  // Getters — leitura imutável
  // -------------------------------------------------------
  get id()            { return this.#id; }
  get pairId()        { return this.#pairId; }
  get name()          { return this.#name; }
  get faceImage()     { return this.#faceImage; }
  get backImage()     { return this.#backImage; }
  get isMico()        { return this.#isMico; }
  get isFaceUp()      { return this.#isFaceUp; }
  get isMatched()     { return this.#isMatched; }
  get ownerPlayerId() { return this.#ownerPlayerId; }
  get orderIndex()    { return this.#orderIndex; }

  // -------------------------------------------------------
  // Mutações de estado de jogo (retornam nova instância)
  // -------------------------------------------------------

  /** Retorna nova instância com carta virada para cima. */
  withFaceUp() {
    return this.#clone({ isFaceUp: true });
  }

  /** Retorna nova instância com carta virada para baixo. */
  withFaceDown() {
    return this.#clone({ isFaceUp: false });
  }

  /** Retorna nova instância marcada como par formado. */
  withMatched() {
    return this.#clone({ isMatched: true });
  }

  /**
   * Retorna nova instância atribuída a um jogador.
   * @param {string} playerId
   */
  withOwner(playerId) {
    return this.#clone({ ownerPlayerId: playerId });
  }

  /**
   * Retorna nova instância com índice de ordem atualizado.
   * @param {number} index
   */
  withOrderIndex(index) {
    return this.#clone({ orderIndex: index });
  }

  // -------------------------------------------------------
  // Serialização (plain object, para envio via rede/Firebase)
  // -------------------------------------------------------

  /** @returns {Object} Representação serializável da carta. */
  toJSON() {
    return {
      id:            this.#id,
      pairId:        this.#pairId,
      name:          this.#name,
      faceImage:     this.#faceImage,
      backImage:     this.#backImage,
      isMico:        this.#isMico,
      isFaceUp:      this.#isFaceUp,
      isMatched:     this.#isMatched,
      ownerPlayerId: this.#ownerPlayerId,
      orderIndex:    this.#orderIndex,
    };
  }

  /**
   * Reconstrói uma Card a partir de um objeto plain (ex: vindo do Firebase).
   * @param {Object} data
   * @returns {Card}
   */
  static fromJSON(data) {
    return new Card(data);
  }

  // -------------------------------------------------------
  // Privados
  // -------------------------------------------------------

  /**
   * Clona esta carta aplicando overrides nos campos informados.
   * @param {Partial<Object>} overrides
   * @returns {Card}
   */
  #clone(overrides) {
    return new Card({ ...this.toJSON(), ...overrides });
  }
}
