/**
 * @layer utils
 * @group timing
 * @role Utility
 * @depends —
 * @exports Time
 *
 * Utilitária estática para temporização.
 * Encapsula setTimeout/clearTimeout e exposição de
 * preferência por redução de movimento (prefers-reduced-motion).
 */
export class Time {
  /**
   * Promessa que resolve após `ms` milissegundos.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  static wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Executa `callback` após `ms` milissegundos e retorna o id do timeout.
   * @param {Function} callback
   * @param {number} ms
   * @returns {number}
   */
  static delay(callback, ms) {
    return setTimeout(callback, ms);
  }

  /**
   * Cancela um timeout criado por delay().
   * @param {number} id
   */
  static cancel(id) {
    clearTimeout(id);
  }

  /**
   * Retorna true se o usuário indicou preferência por menos movimento.
   * @returns {boolean}
   */
  static prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
