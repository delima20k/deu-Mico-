/**
 * @layer utils
 * @group dom
 * @role Utility
 * @depends —
 * @exports Dom
 *
 * Utilitária estática para manipulação de DOM.
 * Centraliza criação de elementos, seletores e registro de listeners
 * com função de cancelamento (unsubscribe).
 */
export class Dom {
  /**
   * Cria um elemento HTML com classes, atributos e conteúdo opcionais.
   * @param {string} tag - Tag HTML
   * @param {Object} [options]
   * @param {string|string[]} [options.classes]
   * @param {Object} [options.attrs]
   * @param {string} [options.html]
   * @param {string} [options.text]
   * @returns {HTMLElement}
   */
  static create(tag, { classes = [], attrs = {}, html = null, text = null } = {}) {
    const el = document.createElement(tag);

    const classList = Array.isArray(classes)
      ? classes.flatMap(c => c.split(' '))
      : classes.split(' ');
    classList.filter(Boolean).forEach(c => el.classList.add(c));

    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));

    if (html !== null) el.innerHTML = html;
    else if (text !== null) el.textContent = text;

    return el;
  }

  /**
   * Seleciona elemento ou lança erro.
   * @param {string} selector
   * @param {HTMLElement} [context=document]
   * @returns {HTMLElement}
   */
  static get(selector, context = document) {
    const el = context.querySelector(selector);
    if (!el) throw new Error(`Dom.get: elemento não encontrado — "${selector}"`);
    return el;
  }

  /**
   * Seleciona múltiplos elementos.
   * @param {string} selector
   * @param {HTMLElement} [context=document]
   * @returns {HTMLElement[]}
   */
  static getAll(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
  }

  /**
   * Remove todos os filhos de um elemento.
   * @param {HTMLElement} el
   */
  static clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  /**
   * Adiciona listener e retorna função de remoção.
   * @param {HTMLElement} el
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} — chame para remover o listener
   */
  static on(el, event, handler) {
    el.addEventListener(event, handler);
    return () => el.removeEventListener(event, handler);
  }
}
