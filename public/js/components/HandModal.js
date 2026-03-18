/**
 * @layer    components
 * @group    game
 * @role     Component
 * @depends  Dom
 * @exports  HandModal
 *
 * Modal fixo no rodape — exibe as cartas da mao do jogador em carrossel.
 *
 * Cada carta chega mostrando o verso (carta_verso.png) e executa flip 3D
 * para revelar o animal/frente um instante depois.
 *
 * Interacoes:
 *  - Arrastar tray  -> rola o carrossel (horizontal)
 *  - 1 toque/clique -> seleciona carta que tem par disponivel na mao
 *  - 2 toques/cliques sequenciais no par -> abre modal de confirmacao
 *  - Confirmar par  -> remove as duas cartas e dispara onPairFormed()
 */

import { Dom } from '../utils/Dom.js';

const BACK_IMG  = 'img/carta_verso.png';
const FLIP_DELAY = 320; // ms apos adicionar a carta antes de virar

export class HandModal {
  // ── DOM
  #el       = null;   // .hand-modal
  #trackEl  = null;   // .hand-modal__track (itens do carrossel)
  #countEl  = null;   // span de contagem

  // ── Estado de dados
  /** @type {import('../domain/Card.js').Card[]} */
  #cards = [];
  /** @type {Map<string, HTMLElement>} id -> .hand-modal__item */
  #itemEls = new Map();

  // ── Estado de selecao de par
  #selectedId = null;

  // ── Pares ja formados (para o modal de resumo)
  /** @type {Array<import('../domain/Card.js').Card[]>} */
  #formedPairs = [];

  /** Callback chamado apos confirmar par. */
  onPairFormed = null;

  // ─────────────────────────────────────────────────────────────────────
  // API publica
  // ─────────────────────────────────────────────────────────────────────

  /** Cria e insere o modal no body. Retorna o elemento raiz. */
  create() {
    // Remove instancia anterior se existir
    document.querySelector('.hand-modal')?.remove();

    const modal = Dom.create('div', { classes: 'hand-modal' });
    this.#el = modal;

    // Cabecalho
    const header = Dom.create('div', { classes: 'hand-modal__header' });
    const title  = Dom.create('span', { classes: 'hand-modal__title', text: 'Sua mao' });
    this.#countEl = Dom.create('span', { classes: 'hand-modal__count', text: '0' });
    header.append(title, this.#countEl);

    // Viewport do carrossel
    const viewport = Dom.create('div', { classes: 'hand-modal__viewport' });
    const track    = Dom.create('div', { classes: 'hand-modal__track'    });
    this.#trackEl  = track;
    viewport.append(track);

    modal.append(header, viewport);
    document.body.append(modal);

    this.#initDrag(viewport, track);
    return modal;
  }

  /**
   * Adiciona uma carta ao carrossel com animacao de flip verso->frente.
   * @param {import('../domain/Card.js').Card} card
   */
  addCard(card) {
    if (!this.#el || !this.#trackEl) return;

    // Exibe o modal na primeira carta
    if (this.#cards.length === 0) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          this.#el.classList.add('hand-modal--visible')
        )
      );
    }

    this.#cards.push(card);
    this.#updateCount();

    const item = this.#buildCardItem(card);
    this.#trackEl.append(item);
    this.#itemEls.set(card.id, item);

    // Flip verso -> frente apos FLIP_DELAY ms
    setTimeout(() => {
      item.querySelector('.hand-modal__card-inner')
          ?.classList.add('hand-modal__card-inner--flipped');
    }, FLIP_DELAY);

    // Rola suavemente ate a carta nova
    setTimeout(() => {
      item.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }, 60);

    this.#attachItemTap(item, card.id);
  }

  /**
   * Remove uma carta pelo id (chamado apos confirmar par).
   * @param {string} cardId
   * @param {boolean} [stolen=false]  true = animação de carta roubada (voo para cima)
   */
  removeCard(cardId, stolen = false) {
    const item = this.#itemEls.get(cardId);
    if (item) {
      if (stolen) {
        item.classList.add('hand-modal__item--stolen');
        setTimeout(() => item.remove(), 540);
      } else {
        item.classList.add('hand-modal__item--removing');
        setTimeout(() => item.remove(), 280);
      }
    }
    this.#itemEls.delete(cardId);
    this.#cards = this.#cards.filter(c => c.id !== cardId);
    this.#updateCount();
  }

  /** Destroi o modal e limpa o estado. */
  destroy() {
    document.querySelector('.hm-pair-modal')?.remove();
    this.#el?.remove();
    this.#el          = null;
    this.#trackEl     = null;
    this.#countEl     = null;
    this.#cards       = [];
    this.#itemEls     = new Map();
    this.#selectedId  = null;
    this.#formedPairs = [];
  }

  // ─────────────────────────────────────────────────────────────────────
  // Construcao do item de carta
  // ─────────────────────────────────────────────────────────────────────

  #buildCardItem(card) {
    const item  = Dom.create('div', { classes: 'hand-modal__item' });
    item.dataset.cardId = card.id;

    // Caixa 3-D de flip
    const inner = Dom.create('div', { classes: 'hand-modal__card-inner' });

    // Verso (carta_verso.png) -- visivel inicialmente
    const faceBack = Dom.create('div', { classes: ['hand-modal__card-face', 'hand-modal__card-face--back'] });
    const imgBack  = Dom.create('img', {
      attrs: { src: BACK_IMG, alt: 'verso', draggable: 'false' },
    });
    faceBack.append(imgBack);

    // Frente (animal) -- oculta ate o flip
    const faceFront = Dom.create('div', { classes: ['hand-modal__card-face', 'hand-modal__card-face--front'] });
    const imgFront  = Dom.create('img', {
      attrs: { src: card.faceImage, alt: card.name || '', draggable: 'false' },
    });
    faceFront.append(imgFront);

    inner.append(faceBack, faceFront);
    item.append(inner);
    return item;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Drag-to-scroll do carrossel
  // ─────────────────────────────────────────────────────────────────────

  #initDrag(viewport, _track) {
    // Usa scroll nativo do browser para máxima fluidez no mobile.
    // touch-action: pan-x é definido no CSS — o browser cuida do momentum/rubber-band.
    // O mouse ainda funciona via wheel e cursor grab.
    let startX = 0, scrollStart = 0, panning = false, moved = false;

    // Mouse — mantido para desktop
    const down = (e) => {
      startX      = e.clientX;
      scrollStart = viewport.scrollLeft;
      panning     = true;
      moved       = false;
    };
    const mouseMove = (e) => {
      if (!panning) return;
      const dx = startX - e.clientX;
      if (Math.abs(dx) > 4) moved = true;
      viewport.scrollLeft = scrollStart + dx;
    };
    const up = () => { panning = false; };

    viewport.addEventListener('mousedown',  down,      { passive: true });
    window.addEventListener ('mousemove',   mouseMove, { passive: true });
    window.addEventListener ('mouseup',     up);

    // Touch — apenas rastreia se houve movimento significativo (para diferenciar tap de scroll)
    viewport.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      moved  = false;
    }, { passive: true });
    viewport.addEventListener('touchmove', (e) => {
      if (Math.abs(e.touches[0].clientX - startX) > 8) moved = true;
    }, { passive: true });
    viewport.addEventListener('touchend', () => {}, { passive: true });

    this._moved = () => moved;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Deteccao de tap/clique em carta
  // ─────────────────────────────────────────────────────────────────────

  #attachItemTap(item, cardId) {
    let t0 = 0;

    const onTap = () => {
      // Ignora se foi um arrasto
      if (this._moved && this._moved()) return;

      const card = this.#cards.find(c => c.id === cardId);
      if (!card) return;

      // Carta sem par na mao — apenas pisca
      if (!this.#hasPair(card)) {
        item.classList.add('hand-modal__item--nopair');
        setTimeout(() => item.classList.remove('hand-modal__item--nopair'), 500);
        return;
      }

      // Ja tem uma carta selecionada?
      if (this.#selectedId && this.#selectedId !== cardId) {
        const selCard = this.#cards.find(c => c.id === this.#selectedId);
        if (selCard && selCard.pairId === card.pairId) {
          // Eh par! Mostra modal de confirmacao
          this.#clearSelection();
          this.#showPairModal(selCard, card);
          return;
        }
        // Nao eh par — desmarca anterior e seleciona este
        this.#clearSelection();
      }

      if (this.#selectedId === cardId) {
        this.#clearSelection();
      } else {
        this.#select(cardId);
      }
    };

    // Touch
    item.addEventListener('touchstart', () => { t0 = Date.now(); }, { passive: true });
    item.addEventListener('touchend', (e) => {
      if (Date.now() - t0 < 300) { e.preventDefault(); onTap(); }
    });

    // Mouse
    item.addEventListener('click', onTap);
  }

  #hasPair(card) {
    return this.#cards.some(c => c.id !== card.id && c.pairId === card.pairId && card.pairId != null);
  }

  #select(cardId) {
    this.#selectedId = cardId;
    const item = this.#itemEls.get(cardId);
    if (!item) return;
    item.classList.add('hand-modal__item--selected');
    // Eleva a carta selecionada para cima de todos os elementos
    item.style.zIndex = '99999';
    item.style.position = 'relative';
  }

  #clearSelection() {
    if (this.#selectedId) {
      const item = this.#itemEls.get(this.#selectedId);
      if (item) {
        item.classList.remove('hand-modal__item--selected');
        item.style.zIndex = '';
        item.style.position = '';
      }
    }
    this.#selectedId = null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Modal de confirmacao de par
  // ─────────────────────────────────────────────────────────────────────

  #showPairModal(cardA, cardB) {
    document.querySelector('.hm-pair-modal')?.remove();

    const overlay = Dom.create('div', { classes: 'hm-pair-modal' });
    const box     = Dom.create('div', { classes: 'hm-pair-modal__box' });

    const titleEl = Dom.create('h3', { classes: 'hm-pair-modal__title' });
    titleEl.textContent = 'Par encontrado! 🎉';

    // Novo par em destaque
    const newRow = Dom.create('div', { classes: 'hm-pair-modal__new-row' });
    const newLbl = Dom.create('p',   { classes: 'hm-pair-modal__lbl--new', text: 'Novo par:' });
    const cards  = Dom.create('div', { classes: 'hm-pair-modal__cards' });
    [cardA, cardB].forEach(c => {
      const w = Dom.create('div', { classes: 'hm-pair-modal__card' });
      const i = Dom.create('img', { attrs: { src: c.faceImage, alt: c.name || '' } });
      w.append(i);
      cards.append(w);
    });
    newRow.append(newLbl, cards);

    // Pares anteriores (se houver)
    let prevSection = null;
    if (this.#formedPairs.length > 0) {
      prevSection = Dom.create('div', { classes: 'hm-pair-modal__prev' });
      const prevLbl = Dom.create('p', { classes: 'hm-pair-modal__lbl--prev', text: 'Pares anteriores:' });
      const grid = Dom.create('div', { classes: 'hm-pair-modal__prev-grid' });
      for (const pair of this.#formedPairs) {
        const pw = Dom.create('div', { classes: 'hm-pair-modal__prev-pair' });
        for (const c of pair) {
          const img = Dom.create('img', {
            classes: 'hm-pair-modal__prev-img',
            attrs: { src: c.faceImage, alt: c.name || '' },
          });
          pw.append(img);
        }
        grid.append(pw);
      }
      prevSection.append(prevLbl, grid);
    }

    // Botoes
    const btns   = Dom.create('div',    { classes: 'hm-pair-modal__btns' });
    const btnOk  = Dom.create('button', { classes: ['hm-pair-modal__btn', 'hm-pair-modal__btn--ok'],
                                          text: '✔ Mover par' });
    const btnNo  = Dom.create('button', { classes: ['hm-pair-modal__btn', 'hm-pair-modal__btn--cancel'],
                                          text: 'Cancelar' });

    const close = () => overlay.remove();

    btnNo.addEventListener('click', () => { this.#clearSelection(); close(); });
    btnOk.addEventListener('click', () => {
      close();
      this.#formedPairs.push([cardA, cardB]);
      this.removeCard(cardA.id);
      this.removeCard(cardB.id);
      if (typeof this.onPairFormed === 'function') this.onPairFormed([cardA, cardB]);
    });

    btns.append(btnOk, btnNo);
    box.append(titleEl, newRow);
    if (prevSection) box.append(prevSection);
    box.append(btns);
    overlay.append(box);
    document.body.append(overlay);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────

  #updateCount() {
    if (!this.#countEl) return;
    const n = this.#cards.length;
    this.#countEl.textContent = n + ' carta' + (n !== 1 ? 's' : '');
  }

  // ─────────────────────────────────────────────────────────────────────
  // API pública de consulta (usada pelo sistema de turnos)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Retorna a carta que forma par com `card` (mesmo pairId, id diferente), ou null.
   * @param {import('../domain/Card.js').Card} card
   * @returns {import('../domain/Card.js').Card|null}
   */
  findPairFor(card) {
    return this.#cards.find(
      c => c.id !== card.id && c.pairId != null && c.pairId === card.pairId
    ) ?? null;
  }

  /**
   * Retorna uma cópia rasa das cartas atuais na mão.
   * @returns {import('../domain/Card.js').Card[]}
   */
  getCards() {
    return [...this.#cards];
  }

  /**
   * Move o viewport do carrossel para a posição proporcional (0–1).
   * Chamado em tempo real quando o picker sincroniza o scroll via Firebase.
   * @param {number} ratio  0 = início, 1 = fim
   */
  setScrollRatio(ratio) {
    const viewportEl = this.#el?.querySelector('.hand-modal__viewport');
    if (!viewportEl) return;
    const max = viewportEl.scrollWidth - viewportEl.clientWidth;
    if (max <= 0) return;
    // Força posicionamento instantâneo (ignora scroll-behavior: smooth do CSS)
    // para garantir sincronização fiel em tempo real em todos os browsers.
    viewportEl.style.scrollBehavior = 'auto';
    viewportEl.scrollLeft = Math.round(ratio * max);
    viewportEl.style.scrollBehavior = '';
  }
}
