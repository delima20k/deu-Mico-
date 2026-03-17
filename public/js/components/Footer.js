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

    // ── Botões de download por plataforma ─────────────────────────────────
    const ua        = navigator.userAgent;
    const isAndroid = /android/i.test(ua);
    const isIOS     = /iphone|ipad|ipod/i.test(ua);

    if (isAndroid) {
      const msg = Dom.create('h3', {
        classes: 'footer__download-title',
        text: '📱 Baixe o app Deu Mico para Android!',
      });
      const btnAndroid = Dom.create('a', {
        classes: 'footer__download-btn',
        attrs: {
          href:     'downloads/deu-mico.apk',
          download: 'deu-mico.apk',
          title:    'Baixar para Android',
        },
      });
      const imgAndroid = Dom.create('img', {
        classes: ['footer__download-img', 'footer__download-img--large'],
        attrs: {
          src:       'img/baixa-android.png',
          alt:       'Baixar para Android',
          draggable: 'false',
        },
      });
      btnAndroid.append(imgAndroid);
      logosContainer.append(msg, btnAndroid);
    } else if (isIOS) {
      const msg = Dom.create('h3', {
        classes: 'footer__download-title',
        text: '🍎 Baixe o app Deu Mico para iPhone!',
      });
      const btnIOS = Dom.create('a', {
        classes: 'footer__download-btn',
        attrs: {
          href:   'https://apps.apple.com/',
          target: '_blank',
          rel:    'noopener noreferrer',
          title:  'Baixar para iOS',
        },
      });
      const imgIOS = Dom.create('img', {
        classes: ['footer__download-img', 'footer__download-img--large'],
        attrs: {
          src:       'img/baixaIOS.png',
          alt:       'Baixar para iOS',
          draggable: 'false',
        },
      });
      btnIOS.append(imgIOS);
      logosContainer.append(msg, btnIOS);
    } else {
      // Desktop / outro — exibe os dois botões lado a lado
      const msg = Dom.create('h3', {
        classes: 'footer__download-title',
        text: '📲 Baixe o app Deu Mico no seu celular!',
      });
      const rowBtns = Dom.create('div', { classes: 'footer__download-row' });

      const btnAndroid = Dom.create('a', {
        classes: 'footer__download-btn',
        attrs: {
          href:     'downloads/deu-mico.apk',
          download: 'deu-mico.apk',
          title:    'Baixar para Android',
        },
      });
      const imgAndroid = Dom.create('img', {
        classes: 'footer__download-img',
        attrs: {
          src:       'img/baixa-android.png',
          alt:       'Baixar para Android',
          draggable: 'false',
        },
      });
      btnAndroid.append(imgAndroid);

      const btnIOS = Dom.create('a', {
        classes: 'footer__download-btn',
        attrs: {
          href:   'https://apps.apple.com/',
          target: '_blank',
          rel:    'noopener noreferrer',
          title:  'Baixar para iOS',
        },
      });
      const imgIOS = Dom.create('img', {
        classes: 'footer__download-img',
        attrs: {
          src:       'img/baixaIOS.png',
          alt:       'Baixar para iOS',
          draggable: 'false',
        },
      });
      btnIOS.append(imgIOS);

      rowBtns.append(btnAndroid, btnIOS);
      logosContainer.append(msg, rowBtns);
    }

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
