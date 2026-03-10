/**
 * @layer    components
 * @group    ui
 * @role     UI
 * @depends  Dom
 * @exports  Footer
 *
 * Componente reutilizável de rodapé com logos de marca e app stores.
 * Exibe: logoMarca.png + badges de Google Play (SVG placeholder)
 */
import { Dom } from '../utils/Dom.js';

export class Footer {
  /** @type {HTMLElement} */
  #el;

  constructor() {
    this.#el = null;
  }

  // -------------------------------------------------------
  // Montagem
  // -------------------------------------------------------

  /**
   * Cria e retorna o elemento HTML do footer.
   * @returns {HTMLElement}
   */
  create() {
    const footer = Dom.create('footer', { classes: 'footer' });

    // Container com logos
    const logosContainer = Dom.create('div', { classes: 'footer__logos' });

    // Logo marca (local) — fallback se arquivo não carregar
    const logoMarca = Dom.create('img', {
      classes: 'footer__logo-marca',
      attrs: {
        src: 'img/logoMarca.png',
        alt: 'Deu Mico Marca',
        draggable: 'false',
        onerror: "this.style.display='none';", // Esconde se não carregar
      },
    });

    logosContainer.append(logoMarca);

    // Parágrafo com z-index sobre a imagem
    const tagline = Dom.create('p', {
      classes: 'footer__tagline',
      text: 'Criando alegria e unindo familias!',
    });

    logosContainer.append(tagline);
    footer.append(logosContainer);

    this.#el = footer;
    return footer;
  }

  /**
   * @returns {HTMLElement|null}
   */
  getElement() {
    return this.#el;
  }
}
