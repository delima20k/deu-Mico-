/**
 * @layer    components
 * @group    game
 * @role     Component (static factory)
 * @depends  Dom
 * @exports  CardRevealModal
 *
 * Modal de revelação de carta com animação 3-D flip (verso → frente).
 * Exibido após o jogador pegar uma carta do oponente.
 * Auto-fecha em 4s ou ao clicar em OK.
 */

import { Dom } from '../utils/Dom.js';

const BACK_IMG = 'img/carta_verso.png';

export class CardRevealModal {
  /**
   * Exibe o modal de revelação de carta.
   * @param {import('../domain/Card.js').Card} card  Carta revelada
   * @param {boolean} pairFormed  Se formou par
   * @param {() => void} [onClose]  Chamado após fechar o modal
   */
  static show(card, pairFormed, onClose) {
    // Remove modal anterior se existir
    document.querySelector('.card-reveal-overlay')?.remove();

    const overlay = Dom.create('div', { classes: 'card-reveal-overlay' });
    const box     = Dom.create('div', { classes: 'card-reveal-box'     });

    // ── Flip 3-D ──────────────────────────────────────────────────────
    const flipWrap  = Dom.create('div', { classes: 'card-reveal-flip' });
    const flipInner = Dom.create('div', { classes: 'card-reveal-flip__inner' });

    const back    = Dom.create('div', { classes: ['card-reveal-flip__face', 'card-reveal-flip__face--back'] });
    const backImg = Dom.create('img', {
      attrs: { src: BACK_IMG, alt: 'verso', draggable: 'false' },
    });
    back.append(backImg);

    const front    = Dom.create('div', { classes: ['card-reveal-flip__face', 'card-reveal-flip__face--front'] });
    const frontImg = Dom.create('img', {
      attrs: { src: card.faceImage, alt: card.name || '', draggable: 'false' },
    });
    front.append(frontImg);

    flipInner.append(back, front);
    flipWrap.append(flipInner);

    // ── Resultado ─────────────────────────────────────────────────────
    const nameEl = Dom.create('p', {
      classes: 'card-reveal-box__name',
      text: card.name || '',
    });

    const resultEl = Dom.create('p', {
      classes: ['card-reveal-box__result',
        pairFormed ? 'card-reveal-box__result--pair' : 'card-reveal-box__result--no-pair'],
      text: pairFormed ? '🎉 Par formado!' : '🃏 Sem par — carta fica na mão',
    });

    const btnClose = Dom.create('button', {
      classes: 'card-reveal-box__close',
      text: 'OK',
      attrs: { type: 'button' },
    });

    box.append(flipWrap, nameEl, resultEl, btnClose);
    overlay.append(box);
    document.body.append(overlay);

    // Dispara o flip após 500 ms (deixa o verso aparecer primeiro)
    setTimeout(() => {
      flipInner.classList.add('card-reveal-flip__inner--flipped');
    }, 500);

    // ── Lógica de fechamento ──────────────────────────────────────────
    let closed = false;

    const close = () => {
      if (closed) return;
      closed = true;
      overlay.classList.add('card-reveal-overlay--closing');
      setTimeout(() => {
        overlay.remove();
        onClose?.();
      }, 300);
    };

    btnClose.addEventListener('click', close);

    // Auto-fecha em 4s (caso o jogador não clique)
    setTimeout(close, 4000);
  }
}
