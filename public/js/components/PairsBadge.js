/**
 * @layer    components
 * @group    game
 * @role     Component
 * @depends  Dom
 * @exports  PairsBadge
 *
 * Mini badge sobreposto ao avatar de um jogador que mostra quantos
 * pares ele já formou. Ao clicar, abre um popover com as imagens dos pares.
 *
 * Uso:
 *   const badge = new PairsBadge(playerBadgeElement, uid, isMe);
 *   badge.addPair([cardA, cardB]);   // chamado após confirmarção
 *   badge.destroy();
 */

import { Dom } from '../utils/Dom.js';

export class PairsBadge {
  /** @type {HTMLElement} Wrapper .player-badge onde o badge será injetado */
  #playerEl;

  /** @type {string} UID do jogador */
  #uid;

  /** @type {boolean} */
  #isMe;

  /** @type {Array<import('../domain/Card.js').Card[]>} Lista de pares */
  #pairs = [];

  /** @type {HTMLElement|null} Elemento do badge numérico */
  #badgeEl = null;

  /** @type {HTMLElement|null} Popover aberto */
  #popoverEl = null;

  /** @type {Function|null} Handler para fechar popover ao clicar fora */
  #outsideHandler = null;

  /**
   * @param {HTMLElement} playerEl  — elemento .player-badge já no DOM
   * @param {string}      uid
   * @param {boolean}     [isMe=false]
   */
  constructor(playerEl, uid, isMe = false) {
    this.#playerEl = playerEl;
    this.#uid      = uid;
    this.#isMe     = isMe;
    // Monta o botão imediatamente para que apareça desde o início (pares 0)
    this.#ensureBadge();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Adiciona um par confirmado e atualiza o badge.
   * @param {import('../domain/Card.js').Card[]} pair - Array de 2 cartas
   */
  addPair(pair) {
    this.#pairs.push(pair);
    this.#ensureBadge();
    this.#updateBadge();
    // O shake é disparado externamente após a animação de arco pousar.
    // Como fallback (ex: par remoto sem objeto de carta), chacoalha aqui também.
    this.shake();
    // Fecha popover se estiver aberto (conteúdo mudou)
    this.#closePopover();
  }

  /**
   * Retorna quantos pares o jogador formou.
   * @returns {number}
   */
  get pairCount() {
    return this.#pairs.length;
  }

  /** @returns {HTMLElement|null} Elemento .pairs-badge (botão) */
  getElement()  { return this.#badgeEl; }

  /** @returns {HTMLElement} Elemento .player-badge pai */
  getPlayerEl() { return this.#playerEl; }

  /**
   * Chacoalha o badge visivelmente — chamado ao pousar o par.
   */
  shake() {
    if (!this.#badgeEl) return;
    this.#badgeEl.classList.remove('pairs-badge--shaking');
    void this.#badgeEl.offsetWidth;
    this.#badgeEl.classList.add('pairs-badge--shaking');
    this.#badgeEl.addEventListener('animationend',
      () => this.#badgeEl?.classList.remove('pairs-badge--shaking'),
      { once: true }
    );
  }

  destroy() {
    this.#closePopover();
    this.#badgeEl?.remove();
    this.#badgeEl = null;
    this.#pairs   = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — badge DOM
  // ─────────────────────────────────────────────────────────────────────────

  #ensureBadge() {
    if (this.#badgeEl) return;

    // Garante que o player-badge tenha position: relative para o badge absoluto
    const cs = getComputedStyle(this.#playerEl);
    if (cs.position === 'static') {
      this.#playerEl.style.position = 'relative';
    }

    const badge = Dom.create('div', {
      classes: 'pairs-badge',
      attrs:   { title: 'Ver pares formados', 'data-uid': this.#uid },
      text:    'pares 0',
    });

    badge.addEventListener('click', (e) => {
      // Se o player-badge é alvo de roubo, deixa o clique borbulhar para abrir o painel de pick
      if (this.#playerEl.classList.contains('player-badge--steal-target')) return;
      e.stopPropagation();
      if (this.#popoverEl) {
        this.#closePopover();
      } else {
        this.#openPopover(badge);
      }
    });

    this.#playerEl.append(badge);
    this.#badgeEl = badge;
  }

  #updateBadge() {
    if (this.#badgeEl) {
      this.#badgeEl.textContent = 'pares ' + String(this.#pairs.length);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private — popover
  // ─────────────────────────────────────────────────────────────────────────

  #openPopover(anchor) {
    const pop = Dom.create('div', { classes: 'pairs-modal' });

    const label = this.#isMe ? 'Seus pares' : `Pares (${this.#pairs.length})`;
    const title = Dom.create('p', { classes: 'pairs-modal__title', text: label });
    pop.append(title);

    const grid = Dom.create('div', { classes: 'pairs-modal__grid' });

    if (this.#pairs.length === 0) {
      const empty = Dom.create('p', {
        classes: 'pairs-modal__title',
        text: 'Nenhum par ainda',
      });
      empty.style.opacity = '0.5';
      grid.append(empty);
    } else {
      for (const pair of this.#pairs) {
        const pairWrap = Dom.create('div', { classes: 'pairs-modal__pair' });
        const imgs     = Dom.create('div', { classes: 'pairs-modal__pair-imgs' });

        for (const card of pair) {
          const img = Dom.create('img', {
            classes: 'pairs-modal__pair-img',
            attrs:   { src: card.faceImage, alt: card.name || '' },
          });
          imgs.append(img);
        }

        const nameEl = Dom.create('span', {
          classes: 'pairs-modal__pair-name',
          text:    pair[0]?.name || '',
        });

        pairWrap.append(imgs, nameEl);
        grid.append(pairWrap);
      }
    }

    pop.append(grid);

    // Posiciona próximo ao anchor
    document.body.append(pop);
    this.#positionPopover(pop, anchor);
    this.#popoverEl = pop;

    // Clique fora fecha
    this.#outsideHandler = (e) => {
      if (!pop.contains(e.target) && e.target !== anchor) {
        this.#closePopover();
      }
    };
    setTimeout(() => document.addEventListener('click', this.#outsideHandler), 0);
  }

  #positionPopover(pop, anchor) {
    const anchorRect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Estimativa de dimensões antes de paint (forçamos layout)
    pop.style.visibility = 'hidden';
    const popRect = pop.getBoundingClientRect();
    pop.style.visibility = '';

    let top  = anchorRect.top  - popRect.height - 8;
    let left = anchorRect.left + anchorRect.width / 2 - popRect.width / 2;

    // Ajust para não sair da viewport
    if (top  < 8)       top  = anchorRect.bottom + 8;
    if (left < 8)       left = 8;
    if (left + popRect.width > vw - 8) left = vw - popRect.width - 8;
    if (top  + popRect.height > vh - 8) top  = vh - popRect.height - 8;

    pop.style.position = 'fixed';
    pop.style.top      = `${top}px`;
    pop.style.left     = `${left}px`;
  }

  #closePopover() {
    this.#popoverEl?.remove();
    this.#popoverEl = null;
    if (this.#outsideHandler) {
      document.removeEventListener('click', this.#outsideHandler);
      this.#outsideHandler = null;
    }
  }
}
