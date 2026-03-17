/**
 * @layer    components
 * @group    game
 * @role     Component
 * @depends  Dom
 * @exports  OpponentPickPanel
 *
 * Painel fixo no rodapé que exibe as cartas viradas de um oponente para
 * o jogador local escolher durante o turno de roubo.
 * Aparece somente quando é a vez do jogador local pegar uma carta.
 */

import { Dom } from '../utils/Dom.js';

const BACK_IMG = 'img/carta_verso.png';

export class OpponentPickPanel {
  #el = null;
  #cards = [];
  /** @type {HTMLElement|null} */
  #viewport = null;
  /** @type {HTMLElement|null} */
  #track = null;
  /** @type {string|null} URL do avatar do dono das cartas */
  #ownerAvatarUrl = null;
  /** @type {Function[]} Limpezas de event-listeners de interação */
  #interCleanups = [];

  /** Callback ao escolher carta: (card, index) => void */
  onCardPicked = null;

  /**
   * Callback disparado IMEDIATAMENTE ao clique (antes da animação).
   * Recebe (card, index, itemRect: DOMRect) para iniciar animação de voo.
   */
  onCardClick = null;

  /** Callback de scroll: (ratio: 0‑1) => void — chamado a cada movimento */
  onScrollChange = null;

  constructor() {}

  /**
   * Exibe o painel com as cartas do oponente (viradas).
   * @param {string} opponentName  Nome exibido no cabeçalho
   * @param {import('../domain/Card.js').Card[]} cards  Cartas do oponente
   * @param {(card: import('../domain/Card.js').Card, idx: number) => void} onCardPicked
   * @param {string|null} [avatarUrl]  URL do avatar do dono das cartas
   */
  show(opponentName, cards, onCardPicked, avatarUrl = null) {
    this.#cards = [...cards];
    this.onCardPicked = onCardPicked;
    this.#ownerAvatarUrl = avatarUrl;
    this.#render(opponentName);
  }

  /**
   * Oculta o painel (com animação de saída).
   */
  hide() {
    if (!this.#el) return;
    // Cancela interações ativas
    this.#interCleanups.forEach(fn => fn());
    this.#interCleanups = [];
    const el = this.#el;
    this.#el = null;
    this.#viewport = null;
    this.#track = null;
    el.classList.remove('opp-pick-panel--visible');
    setTimeout(() => el.remove(), 400);
  }

  /**
   * Remove o painel imediatamente (sem animação).
   */
  destroy() {
    this.#interCleanups.forEach(fn => fn());
    this.#interCleanups = [];
    this.#el?.remove();
    this.#el = null;
    this.#viewport = null;
    this.#track = null;
  }

  /**
   * Sincroniza o scroll do carrossel recebendo ratio externo (0–1).
   * Chamado remotamente quando o oponente move as cartas na visão do picker.
   * @param {number} ratio  0 = início, 1 = fim
   */
  setScrollRatio(ratio) {
    if (!this.#viewport) return;
    const max = this.#viewport.scrollWidth - this.#viewport.clientWidth;
    if (max <= 0) return;
    this.#viewport.scrollLeft = ratio * max;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Construção do DOM
  // ─────────────────────────────────────────────────────────────────────

  #render(opponentName) {
    this.#el?.remove();

    const panel = Dom.create('div', { classes: 'opp-pick-panel' });
    this.#el = panel;

    // ── Owner badge (avatar + nome acima do carrossel) ───────────────
    const owner = Dom.create('div', { classes: 'opp-pick-panel__owner' });
    if (this.#ownerAvatarUrl) {
      const av = Dom.create('img', {
        classes: 'opp-pick-panel__owner-avatar',
        attrs: { src: this.#ownerAvatarUrl, alt: opponentName, draggable: 'false' },
      });
      owner.append(av);
    } else {
      const av = Dom.create('div', {
        classes: ['opp-pick-panel__owner-avatar', 'opp-pick-panel__owner-avatar--initials'],
      });
      av.textContent = opponentName.charAt(0).toUpperCase();
      owner.append(av);
    }
    const ownerName = Dom.create('span', {
      classes: 'opp-pick-panel__owner-name',
      text: opponentName,
    });
    owner.append(ownerName);

    // ── Cabeçalho ──────────────────────────────────────────────────────
    const header = Dom.create('div', { classes: 'opp-pick-panel__header' });

    const title = Dom.create('span', {
      classes: 'opp-pick-panel__title',
      text: `Escolha 1 carta de ${opponentName}`,
    });
    const countEl = Dom.create('span', {
      classes: 'opp-pick-panel__count',
      text: `${this.#cards.length} carta${this.#cards.length !== 1 ? 's' : ''}`,
    });
    header.append(title, countEl);

    // ── Carrossel de cartas (verso) ────────────────────────────────────
    const viewport = Dom.create('div', { classes: 'opp-pick-panel__viewport' });
    const track    = Dom.create('div', { classes: 'opp-pick-panel__track'    });

    this.#cards.forEach((card, i) => {
      const item = Dom.create('div', { classes: 'opp-pick-panel__item' });
      item.dataset.idx = String(i);

      const inner = Dom.create('div', { classes: 'opp-pick-panel__card-inner' });
      const img   = Dom.create('img', {
        attrs: { src: BACK_IMG, alt: 'carta', draggable: 'false' },
      });
      inner.append(img);
      item.append(inner);

      let pickedDone = false;
      item.addEventListener('click', () => {
        // Ignora se estava em arrasto ou já foi escolhida
        if (this._moved?.() || pickedDone) return;
        pickedDone = true;
        // Captura posição ANTES da animação e dispara imediatamente
        const itemRect = item.getBoundingClientRect();
        this.onCardClick?.(card, i, itemRect);
        item.classList.add('opp-pick-panel__item--picked');
        // Dispara callback após a animação de voo terminar (480 ms)
        setTimeout(() => this.onCardPicked?.(card, i), 480);
      });

      track.append(item);
    });

    this.#viewport = viewport;
    this.#track    = track;

    viewport.append(track);
    panel.append(owner, header, viewport);
    document.body.append(panel);

    // Posiciona o painel acima da hand-modal do jogador local.
    // Em landscape usa 1rem de gap; em portrait usa 5rem.
    const handEl   = document.querySelector('.hand-modal');
    const handH    = handEl ? handEl.offsetHeight : 0;
    const isLandscape = window.matchMedia('(orientation: landscape)').matches;
    const gap      = isLandscape ? '1rem' : '5rem';
    panel.style.bottom = `calc(${handH}px + ${gap})`;

    // Drag-to-scroll + referência ao flag moved usada pelo click
    this.#initDrag(viewport, track);
    // Efeito de proximidade em tempo real
    this.#initCardInteraction(viewport, track);

    // Animação de entrada (slide-up)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => panel.classList.add('opp-pick-panel--visible'))
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // Drag-to-scroll
  // ─────────────────────────────────────────────────────────────────────

  #initDrag(viewport, track) {
    let startX = 0, scrollStart = 0, panning = false, moved = false;
    let lastMoveX = 0, lastMoveTime = 0, velX = 0;
    let rafMomentum = null;

    const emitRatio = () => {
      const max = viewport.scrollWidth - viewport.clientWidth;
      if (max > 0) this.onScrollChange?.(viewport.scrollLeft / max);
    };

    const down = (e) => {
      cancelAnimationFrame(rafMomentum);
      startX      = e.touches ? e.touches[0].clientX : e.clientX;
      scrollStart = viewport.scrollLeft;
      panning     = true;
      moved       = false;
      velX        = 0;
      lastMoveX   = startX;
      lastMoveTime = Date.now();
    };
    const move = (e) => {
      if (!panning) return;
      const x   = e.touches ? e.touches[0].clientX : e.clientX;
      const now = Date.now();
      const dt  = Math.max(1, now - lastMoveTime);
      velX      = (lastMoveX - x) / dt;   // px/ms
      lastMoveX    = x;
      lastMoveTime = now;
      const dx = startX - x;
      if (Math.abs(dx) > 5) moved = true;
      viewport.scrollLeft = scrollStart + dx;
      emitRatio();
    };
    const up = () => {
      if (!panning) return;
      panning = false;
      emitRatio();
      // Inércia suave
      let vel = velX * 14;  // amplifica px/ms → px/frame@60fps
      const tick = () => {
        if (Math.abs(vel) < 0.4) return;
        viewport.scrollLeft += vel;
        vel *= 0.88;
        emitRatio();
        rafMomentum = requestAnimationFrame(tick);
      };
      rafMomentum = requestAnimationFrame(tick);
    };

    // Expõe flag para os listeners de click nas cartas
    this._moved = () => moved;

    viewport.addEventListener('mousedown',  down, { passive: true });
    window.addEventListener  ('mousemove',  move, { passive: true });
    window.addEventListener  ('mouseup',    up);
    viewport.addEventListener('touchstart', down, { passive: true });
    viewport.addEventListener('touchmove',  move, { passive: true });
    viewport.addEventListener('touchend',   up,   { passive: true });

    this.#interCleanups.push(() => {
      cancelAnimationFrame(rafMomentum);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup',   up);
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Efeito de proximidade em tempo real (cartas levantam perto do cursor)
  // ─────────────────────────────────────────────────────────────────────

  #initCardInteraction(viewport, track) {
    const MAX_DIST = 130;   // px — raio de influência
    const MAX_LIFT = 28;    // px — elevação máxima

    const getItems = () => [...track.querySelectorAll('.opp-pick-panel__item')];

    const applyLift = (clientX) => {
      getItems().forEach(item => {
        if (item.classList.contains('opp-pick-panel__item--picked')) return;
        const rect   = item.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const dist   = Math.abs(clientX - center);
        const lift   = dist < MAX_DIST
          ? Math.round(MAX_LIFT * (1 - dist / MAX_DIST) ** 1.4)
          : 0;
        item.style.setProperty('--opp-lift', `${lift}px`);
        // Brilha a borda proporcional ao lift
        const alpha = lift > 2 ? (lift / MAX_LIFT * 0.75 + 0.15).toFixed(2) : '0.25';
        item.style.setProperty('border-color',
          `rgba(100,200,255,${alpha})`);
        item.style.setProperty('box-shadow',
          lift > 2
            ? `0 ${4 + lift / 2}px ${14 + lift}px rgba(50,140,255,${(lift / MAX_LIFT * 0.5).toFixed(2)})`
            : '0 4px 14px rgba(0,0,0,0.55)');
      });
    };

    const clearLift = () => {
      getItems().forEach(item => {
        item.style.removeProperty('--opp-lift');
        item.style.removeProperty('border-color');
        item.style.removeProperty('box-shadow');
      });
    };

    const onMove  = (e) => applyLift(e.clientX);
    const onTouch = (e) => applyLift(e.touches[0].clientX);

    viewport.addEventListener('mousemove',  onMove,   { passive: true });
    viewport.addEventListener('touchmove',  onTouch,  { passive: true });
    viewport.addEventListener('mouseleave', clearLift, { passive: true });
    viewport.addEventListener('touchend',   clearLift, { passive: true });

    this.#interCleanups.push(() => {
      viewport.removeEventListener('mousemove',  onMove);
      viewport.removeEventListener('touchmove',  onTouch);
      viewport.removeEventListener('mouseleave', clearLift);
      viewport.removeEventListener('touchend',   clearLift);
    });
  }
}
