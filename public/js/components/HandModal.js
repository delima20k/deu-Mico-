/**
 * @layer    components
 * @group    game
 * @role     Component
 * @depends  Dom
 * @exports  HandModal
 *
 * Modal fixo no rodapÃ© que exibe as cartas da mÃ£o do jogador local.
 *
 * Funcionalidades:
 *  - Desliza de baixo para cima quando a primeira carta chega.
 *  - Clique em carta â†’ abre overlay ampliado sobre todos os elementos.
 *  - SeleÃ§Ã£o de par: clicar em carta com par disponÃ­vel  marca como selecionada;
 *    clicar na segunda carta do par abre modal de confirmaÃ§Ã£o.
 *  - ApÃ³s confirmaÃ§Ã£o, o par Ã© removido da mÃ£o e disparado via onPairFormed().
 *  - Arrastar carta dentro do tray â†’ reordena posiÃ§Ã£o.
 */

import { Dom } from '../utils/Dom.js';

export class HandModal {
  /** @type {HTMLElement|null} */
  #el = null;
  /** @type {HTMLElement|null} */
  #trayEl = null;
  /** @type {HTMLElement|null} */
  #countEl = null;

  /** @type {import('../domain/Card.js').Card[]} */
  #cards = [];

  /** @type {Map<string, HTMLElement>} Card.id â†’ .hand-modal__card-wrap */
  #cardEls = new Map();

  /** @type {string|null} ID da carta atualmente no overlay ampliado */
  #enlargedCardId = null;

  /** @type {HTMLElement|null} Backdrop do overlay */
  #enlargedBackdrop = null;
  /** @type {HTMLElement|null} Elemento do overlay da carta */
  #enlargedEl = null;

  /** @type {string|null} ID da carta selecionada aguardando par */
  #selectedCardId = null;

  /**
   * Callback disparado quando um par Ã© confirmado.
   * @type {((pair: import('../domain/Card.js').Card[]) => void)|null}
   */
  onPairFormed = null;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Public API
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  create() {
    const modal = Dom.create('div', { classes: 'hand-modal' });
    this.#el = modal;

    const header  = Dom.create('div', { classes: 'hand-modal__header' });
    const title   = Dom.create('p',    { classes: 'hand-modal__title', text: 'Sua mÃ£o' });
    this.#countEl = Dom.create('span', { classes: 'hand-modal__count', text: '0 cartas' });
    header.append(title, this.#countEl);

    const tray = Dom.create('div', { classes: 'hand-modal__tray' });
    this.#trayEl = tray;
    this.#setupTrayDrag(tray);

    modal.append(header, tray);
    document.body.append(modal);
    return modal;
  }

  addCard(card) {
    if (!this.#el || !this.#trayEl) return;

    if (this.#cards.length === 0) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this.#el.classList.add('hand-modal--visible'));
      });
    }

    this.#cards.push(card);
    this.#updateCount();

    const wrap = Dom.create('div', {
      classes: ['hand-modal__card-wrap', 'hand-modal__card-wrap--entering'],
    });
    wrap.dataset.cardId = card.id;

    const img = Dom.create('img', {
      classes: 'hand-modal__card-img',
      attrs: { src: card.faceImage, alt: card.name || '', draggable: 'false' },
    });
    wrap.append(img);
    this.#trayEl.append(wrap);
    this.#cardEls.set(card.id, wrap);

    setTimeout(() => wrap.classList.remove('hand-modal__card-wrap--entering'), 350);
    setTimeout(() => {
      wrap.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }, 80);

    this.#attachCardInteractions(wrap, card.id);
  }

  /** Remove uma carta da mÃ£o (apÃ³s confirmar par). */
  removeCard(cardId) {
    this.#cardEls.get(cardId)?.remove();
    this.#cardEls.delete(cardId);
    this.#cards = this.#cards.filter(c => c.id !== cardId);
    this.#updateCount();
  }

  destroy() {
    this.#closeEnlargedOverlay();
    this.#el?.remove();
    this.#el              = null;
    this.#trayEl          = null;
    this.#countEl         = null;
    this.#cards           = [];
    this.#cardEls         = new Map();
    this.#enlargedCardId  = null;
    this.#selectedCardId  = null;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Private â€” pair detection helpers
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Verifica se existe outra carta na mÃ£o com o mesmo pairId. */
  #hasPairInHand(card) {
    return this.#cards.some(c => c.id !== card.id && c.pairId === card.pairId);
  }

  /** Retorna o par de uma carta na mÃ£o, ou null. */
  #getPairCard(card) {
    return this.#cards.find(c => c.id !== card.id && c.pairId === card.pairId) ?? null;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Private â€” Tray drag-to-scroll
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  #setupTrayDrag(tray) {
    let startX = 0, scrollStart = 0, isDragging = false;

    tray.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.hand-modal__card-wrap')) return;
      isDragging  = true;
      startX      = e.clientX;
      scrollStart = tray.scrollLeft;
      tray.setPointerCapture(e.pointerId);
      tray.style.cursor = 'grabbing';
    });

    tray.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      tray.scrollLeft = scrollStart - (e.clientX - startX);
    });

    const stop = () => { isDragging = false; tray.style.cursor = ''; };
    tray.addEventListener('pointerup',     stop);
    tray.addEventListener('pointercancel', stop);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Private â€” Card interactions
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  #attachCardInteractions(wrap, cardId) {
    let startX = 0, startY = 0, hasMoved = false, isDraggingCard = false;

    wrap.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      startX = e.clientX; startY = e.clientY;
      hasMoved = false; isDraggingCard = false;

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!hasMoved && Math.hypot(dx, dy) > 10) {
          hasMoved = isDraggingCard = true;
          this.#startCardDrag(wrap, cardId, ev);
        }
        if (isDraggingCard) {
          const clone = document.getElementById('hm-drag-clone');
          if (clone) { clone.style.left = `${ev.clientX}px`; clone.style.top = `${ev.clientY}px`; }
          this.#updateDropTarget(ev.clientX, cardId);
        }
      };

      const onUp = (ev) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup',   onUp);

        if (isDraggingCard) {
          this.#finishCardDrag(cardId);
        } else if (!hasMoved) {
          this.#onCardClick(cardId, ev);
        }
        isDraggingCard = false;
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup',   onUp);
    });
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Private â€” Click logic (ampliar + selecionar par)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  #onCardClick(cardId, ev) {
    const card = this.#cards.find(c => c.id === cardId);
    if (!card) return;

    // Se jÃ¡ tem uma carta selecionada â†’ verificar se esta Ã© o par
    if (this.#selectedCardId && this.#selectedCardId !== cardId) {
      const selCard = this.#cards.find(c => c.id === this.#selectedCardId);
      if (selCard && selCard.pairId === card.pairId) {
        // Ã‰ o par! Abrir modal de confirmaÃ§Ã£o
        this.#closeEnlargedOverlay();
        this.#showPairConfirm(selCard, card);
        return;
      }
      // NÃ£o Ã© o par â€” desseleciona o anterior e continua
      this.#clearSelection();
    }

    // Verificar se esta carta tem par na mÃ£o â†’ modo seleÃ§Ã£o
    if (this.#hasPairInHand(card)) {
      // Toggle seleÃ§Ã£o
      if (this.#selectedCardId === cardId) {
        this.#clearSelection();
      } else {
        this.#clearSelection();
        this.#selectedCardId = cardId;
        this.#cardEls.get(cardId)?.classList.add('hand-modal__card-wrap--selected');
      }
      return;
    }

    // Carta sem par â†’ abre overlay ampliado
    this.#openEnlargedOverlay(card, ev);
  }

  #clearSelection() {
    if (this.#selectedCardId) {
      this.#cardEls.get(this.#selectedCardId)?.classList.remove('hand-modal__card-wrap--selected');
    }
    this.#selectedCardId = null;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Private â€” Overlay ampliado (acima de tudo)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  #openEnlargedOverlay(card, ev) {
    this.#closeEnlargedOverlay();

    const backdrop = Dom.create('div', { classes: 'hm-enlarged-backdrop' });
    backdrop.addEventListener('click', () => this.#closeEnlargedOverlay());

    const overlay = Dom.create('div', { classes: 'hm-enlarged-overlay' });
    // Posiciona centrado na carte clicada
    const wrap = this.#cardEls.get(card.id);
    if (wrap) {
      const r   = wrap.getBoundingClientRect();
      const cx  = r.left + r.width  / 2;
      const cy  = r.top  + r.height / 2;
      overlay.style.left = `${cx}px`;
      overlay.style.top  = `${cy - 60}px`; // levanta um pouco
    } else {
      overlay.style.left = '50%';
      overlay.style.top  = '40%';
    }

    const img = Dom.create('img', {
      attrs: { src: card.faceImage, alt: card.name || '', draggable: 'false' },
    });
    overlay.append(img);
    overlay.addEventListener('click', () => this.#closeEnlargedOverlay());

    document.body.append(backdrop, overlay);
    this.#enlargedBackdrop = backdrop;
    this.#enlargedEl       = overlay;
    this.#enlargedCardId   = card.id;
  }

  #closeEnlargedOverlay() {
    this.#enlargedBackdrop?.remove();
    this.#enlargedEl?.remove();
    this.#enlargedBackdrop = null;
    this.#enlargedEl       = null;
    this.#enlargedCardId   = null;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Private â€” Modal de confirmaÃ§Ã£o de par
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  #showPairConfirm(cardA, cardB) {
    const overlay = Dom.create('div', { classes: 'hm-pair-confirm' });

    const box = Dom.create('div', { classes: 'hm-pair-confirm__box' });

    // Imagens das duas cartas
    const cardsRow = Dom.create('div', { classes: 'hm-pair-confirm__cards' });
    [cardA, cardB].forEach(c => {
      const wrap = Dom.create('div', { classes: 'hm-pair-confirm__card' });
      const img  = Dom.create('img', { attrs: { src: c.faceImage, alt: c.name || '' } });
      wrap.append(img);
      cardsRow.append(wrap);
    });

    const text = Dom.create('p', {
      classes: 'hm-pair-confirm__text',
    });
    text.innerHTML = `<strong>${cardA.name}</strong> faz par!<br>Confirmar e retirar da mÃ£o?`;

    const btns    = Dom.create('div',    { classes: 'hm-pair-confirm__btns' });
    const btnOk   = Dom.create('button', { classes: ['hm-pair-confirm__btn', 'hm-pair-confirm__btn--confirm'], text: 'âœ” Confirmar' });
    const btnCancel = Dom.create('button', { classes: ['hm-pair-confirm__btn', 'hm-pair-confirm__btn--cancel'], text: 'Cancelar' });

    const close = () => overlay.remove();

    btnCancel.addEventListener('click', () => {
      this.#clearSelection();
      close();
    });

    btnOk.addEventListener('click', () => {
      close();
      this.#clearSelection();
      // Remove as duas cartas da mÃ£o
      this.removeCard(cardA.id);
      this.removeCard(cardB.id);
      // Dispara callback para o GameTableScreen lidar com pares
      if (typeof this.onPairFormed === 'function') {
        this.onPairFormed([cardA, cardB]);
      }
    });

    btns.append(btnOk, btnCancel);
    box.append(cardsRow, text, btns);
    overlay.append(box);
    document.body.append(overlay);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Private â€” Drag-to-reorder helpers
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  #startCardDrag(wrap, cardId, e) {
    const ghost = Dom.create('div', {
      classes: ['hand-modal__card-wrap', 'hand-modal__card-wrap--ghost'],
    });
    ghost.style.width  = `${wrap.offsetWidth}px`;
    ghost.style.height = `${wrap.offsetHeight}px`;
    ghost.dataset.ghost = cardId;
    this.#cardEls.set(cardId + '_ghost', ghost);
    wrap.classList.add('hand-modal__card-wrap--dragging');
    wrap.after(ghost);

    const clone = wrap.cloneNode(true);
    clone.id = 'hm-drag-clone';
    clone.style.cssText = `
      position:fixed;left:${e.clientX}px;top:${e.clientY}px;
      width:${wrap.offsetWidth}px;height:${wrap.offsetHeight}px;
      transform:translate(-50%,-60%) scale(1.15);z-index:9500;
      pointer-events:none;opacity:0.92;transition:none;
      border-radius:${getComputedStyle(wrap).borderRadius};
      box-shadow:0 8px 24px rgba(0,0,0,0.5);
    `;
    document.body.append(clone);
  }

  #updateDropTarget(clientX, dragId) {
    if (!this.#trayEl) return;
    const wraps = [...this.#trayEl.querySelectorAll(
      '.hand-modal__card-wrap:not(.hand-modal__card-wrap--ghost):not(.hand-modal__card-wrap--dragging)'
    )];
    let closest = null, minDist = Infinity;
    for (const w of wraps) {
      const r = w.getBoundingClientRect();
      const dist = Math.abs(r.left + r.width / 2 - clientX);
      if (dist < minDist) { minDist = dist; closest = w; }
    }
    const ghost = this.#cardEls.get(dragId + '_ghost');
    if (!ghost || !closest || closest === ghost) return;
    const gIdx = [...this.#trayEl.children].indexOf(ghost);
    const tIdx = [...this.#trayEl.children].indexOf(closest);
    if (gIdx !== tIdx) {
      if (clientX < closest.getBoundingClientRect().left + closest.offsetWidth / 2) {
        closest.before(ghost);
      } else {
        closest.after(ghost);
      }
    }
  }

  #finishCardDrag(cardId) {
    const wrap  = this.#cardEls.get(cardId);
    const ghost = this.#cardEls.get(cardId + '_ghost');
    document.getElementById('hm-drag-clone')?.remove();
    if (wrap && ghost) {
      ghost.replaceWith(wrap);
      wrap.classList.remove('hand-modal__card-wrap--dragging');
      this.#cardEls.delete(cardId + '_ghost');
      const newOrder = [];
      for (const child of this.#trayEl.children) {
        const cid = child.dataset.cardId;
        if (cid) {
          const card = this.#cards.find(c => c.id === cid);
          if (card) newOrder.push(card);
        }
      }
      this.#cards = newOrder;
    }
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Private â€” Helpers
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  #updateCount() {
    if (!this.#countEl) return;
    const n = this.#cards.length;
    this.#countEl.textContent = `${n} carta${n !== 1 ? 's' : ''}`;
  }
}


