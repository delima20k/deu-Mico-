/**
 * @layer utils
 * @group responsive
 * @role Utility
 * @depends —
 * @exports Responsive
 *
 * Utilitária estática de responsividade.
 * Exposição de breakpoints via matchMedia e dimensões de viewport.
 */
export class Responsive {
  /**
   * Registra callback para mudanças de breakpoint.
   * @param {'sm'|'md'|'lg'|'xl'} breakpoint
   * @param {Function} callback
   * @returns {Function} — chame para cancelar a inscrição
   */
  static onBreakpoint(breakpoint, callback) {
    const queries = {
      sm:  '(min-width: 480px)',
      md:  '(min-width: 768px)',
      lg:  '(min-width: 1024px)',
      xl:  '(min-width: 1280px)',
    };

    const mq = window.matchMedia(queries[breakpoint]);
    const handler = e => callback(e.matches);

    mq.addEventListener('change', handler);
    callback(mq.matches); // dispara imediatamente

    return () => mq.removeEventListener('change', handler);
  }

  /**
   * Retorna true se a viewport for mobile (< 768px).
   * @returns {boolean}
   */
  static isMobile() {
    return !window.matchMedia('(min-width: 768px)').matches;
  }

  /**
   * Retorna a largura atual da viewport.
   * @returns {number}
   */
  static viewportWidth() {
    return window.innerWidth;
  }

  /**
   * Retorna a altura atual da viewport.
   * @returns {number}
   */
  static viewportHeight() {
    return window.innerHeight;
  }
}
