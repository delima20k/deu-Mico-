/**
 * @layer core
 * @group navigation
 * @role Core
 * @depends Screen, Time
 * @exports ScreenManager
 *
 * Gerencia o ciclo de vida e transição de fade entre telas.
 * Recebe instâncias de Screen registradas pelo App e controla
 * qual está visível a cada momento.
 */
import { Time } from '../utils/Time.js';

export class ScreenManager {
  /** @type {HTMLElement} */
  #root;

  /** @type {Map<string, import('./Screen.js').Screen>} */
  #screens = new Map();

  /** @type {import('./Screen.js').Screen|null} */
  #current = null;

  /** @type {boolean} */
  #transitioning = false;

  /** @type {boolean} — true enquanto onEnter() da tela atual ainda está em execução */
  #entering = false;

  /**
   * @param {HTMLElement} root - Container onde as telas serão montadas
   */
  constructor(root) {
    this.#root = root;
  }

  // -------------------------------------------------------
  // Registro
  // -------------------------------------------------------

  /**
   * Registra uma instância de Screen.
   * @param {import('./Screen.js').Screen} screen
   */
  register(screen) {
    const name = screen.getName();
    if (this.#screens.has(name)) {
      console.warn(`[ScreenManager] Tela já registrada: "${name}". Sobrescrevendo.`);
    }
    this.#screens.set(name, screen);
  }

  /**
   * Registra múltiplas telas de uma vez.
   * @param {import('./Screen.js').Screen[]} screens
   */
  registerAll(screens) {
    screens.forEach(s => this.register(s));
  }

  // -------------------------------------------------------
  // Navegação
  // -------------------------------------------------------

  /**
   * Exibe a tela com o nome fornecido, com transição de fade.
   * @param {string} name    - Nome da tela registrada
   * @param {Object} [params={}] - Parâmetros passados para onEnter()
   */
  async show(name, params = {}) {
    if (this.#transitioning) return;

    const next = this.#screens.get(name);
    if (!next) {
      throw new Error(`[ScreenManager] Tela não encontrada: "${name}"`);
    }

    if (this.#current === next) return;

    this.#transitioning = true;

    // 1. Fade-out da tela atual
    if (this.#current) {
      const currentEl = this.#current.getElement();
      if (currentEl) {
        currentEl.classList.add('screen--hidden');
        await Time.wait(600);
      }
      this.#current.unmount();
    }

    // 2. Monta a nova tela
    next.mount(this.#root);
    const nextEl = next.getElement();

    if (nextEl) {
      nextEl.classList.add('screen--hidden');
      void nextEl.offsetWidth; // força reflow para CSS transition funcionar
      nextEl.classList.remove('screen--hidden');
    }

    this.#current      = next;
    this.#transitioning = false;

    // 3. Chama onEnter após visibilidade.
    // ATENÇÃO: #transitioning já é false aqui para permitir que a tela responda
    // a interações do usuário durante o onEnter (ex: botão sair do jogo).
    // A proteção contra re-entrada na MESMA tela é garantida por #current === next.
    // Para evitar que uma nova tela seja exibida enquanto onEnter ainda está em
    // execução, usamos #entering como flag de guarda adicional.
    this.#entering = true;
    try {
      await next.onEnter(params);
    } finally {
      this.#entering = false;
    }
  }

  // -------------------------------------------------------
  // Getters
  // -------------------------------------------------------

  /** @returns {import('./Screen.js').Screen|null} */
  getCurrentScreen() { return this.#current; }

  /** @returns {string[]} */
  getRegisteredScreens() { return Array.from(this.#screens.keys()); }

  /** @returns {boolean} true enquanto onEnter() da tela atual ainda está rodando */
  isEnteringScreen() { return this.#entering; }
}
