/**
 * @layer core
 * @group navigation
 * @role Core
 * @depends —
 * @exports Screen
 *
 * Classe base abstrata para todas as telas do jogo.
 *
 * Cada tela concreta deve estender Screen e implementar:
 *   - _buildTemplate() → retorna HTMLElement com o conteúdo da tela
 *   - onEnter(params)   → lógica de entrada (animações, timers, etc.)
 *   - onExit()          → limpeza antes de sair (cancelar timers, etc.)
 *
 * Campos internos usam # (privados). Subclasses acessam via getters públicos:
 *   getName(), getElement(), isMounted()
 */
export class Screen {
  /** @type {string} */
  #name;

  /** @type {HTMLElement|null} */
  #root = null;

  /** @type {HTMLElement|null} */
  #element = null;

  /** @type {boolean} */
  #mounted = false;

  /**
   * @param {string} name - Identificador único da tela
   */
  constructor(name) {
    if (new.target === Screen) {
      throw new Error('Screen é abstrata — use uma subclasse.');
    }
    this.#name = name;
  }

  // -------------------------------------------------------
  // Ciclo de vida — gerenciado pelo ScreenManager
  // -------------------------------------------------------

  /**
   * Monta a tela no container raiz.
   * @param {HTMLElement} root
   */
  mount(root) {
    if (this.#mounted) return;

    this.#root    = root;
    this.#element = this._buildTemplate();

    this.#element.classList.add('screen');
    this.#element.dataset.screen = this.#name;

    root.appendChild(this.#element);
    this.#mounted = true;
  }

  /**
   * Remove a tela do DOM e libera recursos.
   */
  unmount() {
    if (!this.#mounted) return;

    this.onExit();
    this.#element?.remove();
    this.#element = null;
    this.#mounted = false;
  }

  // -------------------------------------------------------
  // Hooks — sobrescrever nas subclasses
  // -------------------------------------------------------

  /**
   * Chamado pelo ScreenManager após mount(), com parâmetros opcionais.
   * Inicie animações e timers aqui.
   * @param {Object} [params={}]
   * @returns {void|Promise<void>}
   */
  onEnter(params = {}) {} // eslint-disable-line no-unused-vars

  /**
   * Chamado antes de unmount(). Cancele timers, remova listeners, etc.
   * @returns {void}
   */
  onExit() {}

  // -------------------------------------------------------
  // Template — implementar nas subclasses (método protegido)
  // -------------------------------------------------------

  /**
   * Método protegido (convenção _) que subclasses DEVEM sobrescrever.
   * Retorna o HTMLElement raiz da tela.
   * @abstract
   * @returns {HTMLElement}
   */
  _buildTemplate() {
    throw new Error(`${this.#name}: _buildTemplate() não implementado.`);
  }

  // -------------------------------------------------------
  // Getters públicos
  // -------------------------------------------------------

  /** @returns {string} */
  getName() { return this.#name; }

  /** @returns {HTMLElement|null} */
  getElement() { return this.#element; }

  /** @returns {boolean} */
  isMounted() { return this.#mounted; }
}
