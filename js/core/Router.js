/**
 * @layer core
 * @group navigation
 * @role Core
 * @depends ScreenManager
 * @exports Router
 *
 * Roteamento baseado em hash de URL.
 * Mapeia hashes (ex.: #home, #login) a nomes de telas registradas
 * no ScreenManager, permitindo navegação via histórico do browser.
 */
import { ScreenManager } from './ScreenManager.js';

export class Router {
  /** @type {ScreenManager} */
  #manager;

  /**
   * Mapa de hash → nome da tela.
   * @type {Map<string, string>}
   */
  #routes = new Map();

  /** @type {() => void} Referência vinculada para removeEventListener */
  #boundHashChange;

  /**
   * @param {ScreenManager} screenManager
   */
  constructor(screenManager) {
    this.#manager         = screenManager;
    this.#boundHashChange = () => this.#handleHashChange();
  }

  // -------------------------------------------------------
  // Configuração
  // -------------------------------------------------------

  /**
   * Define uma rota.
   * @param {string} hash        - Hash da URL, ex.: '#home'
   * @param {string} screenName  - Nome da tela registrada no ScreenManager
   * @returns {Router} this — fluent API
   */
  addRoute(hash, screenName) {
    this.#routes.set(hash, screenName);
    return this;
  }

  /** Inicia o roteamento por hash. */
  start() {
    window.addEventListener('hashchange', this.#boundHashChange);
  }

  /** Para o roteamento. */
  stop() {
    window.removeEventListener('hashchange', this.#boundHashChange);
  }

  // -------------------------------------------------------
  // Navegação programática
  // -------------------------------------------------------

  /**
   * Navega para um hash (atualiza a URL sem recarregar).
   * @param {string} hash
   */
  navigate(hash) {
    window.location.hash = hash;
  }

  // -------------------------------------------------------
  // Privado
  // -------------------------------------------------------

  #handleHashChange() {
    const hash       = window.location.hash || '';
    const screenName = this.#routes.get(hash);
    if (screenName) {
      this.#manager.show(screenName);
    }
  }
}
