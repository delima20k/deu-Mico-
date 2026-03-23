/**
 * @layer   config
 * @group   environment
 * @role    Configuration
 * @exports AppConfig
 *
 * Configuração centralizada de ambiente.
 *
 * Detecta automaticamente dev vs produção sem variáveis de build.
 * Expõe helpers reutilizáveis por qualquer módulo do projeto.
 *
 * Uso:
 *   import { AppConfig } from '../config/AppConfig.js';
 *   const src = AppConfig.avatarProxyUrl(googlePhotoUrl);
 */
export const AppConfig = Object.freeze({

  /**
   * true quando rodando em localhost ou 127.0.0.1.
   * Em produção (Vercel, GitHub Pages, domínio próprio) sempre false.
   * @type {boolean}
   */
  isDev: ['localhost', '127.0.0.1'].includes(
    globalThis.location?.hostname ?? ''
  ),

  /**
   * Retorna a URL correta do avatar segundo o ambiente:
   *  - dev      → URL original (sem proxy, sem servidor adicional)
   *  - produção → /api/avatar-proxy (Vercel Serverless Function)
   *
   * @param {string|null} url - URL original do avatar (Google ou qualquer outra)
   * @returns {string|null}
   */
  avatarProxyUrl(url) {
    if (!url) return null;
    if (!url.includes('googleusercontent.com')) return url;
    if (this.isDev) return url;
    return `/api/avatar-proxy?url=${encodeURIComponent(url)}`;
  },

});
