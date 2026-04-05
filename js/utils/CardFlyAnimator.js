/**
 * @layer    utils
 * @group    game
 * @role     Animation
 * @exports  flyCardToAvatar, animatePairArcToButton
 *
 * Animações de voo de carta:
 *   flyCardToAvatar(fromRect, toEl)
 *       Carta (verso) voa devagar do pick-panel ao avatar do ladrão.
 *
 *   animatePairArcToButton(pair, fromEl, toEl, onDone)
 *       Par de cartas (face) sai do avatar do jogador, rodeia um lado
 *       e pousa no botão de pares.
 */

// ─────────────────────────────────────────────────────────────
// Helpers de matemática
// ─────────────────────────────────────────────────────────────

/** Interpolação linear */
const lerp = (a, b, t) => a + (b - a) * t;

/** Ponto em bezier quadrática */
const bezier2 = (p0, p1, p2, t) => {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
};

/** Centro de um DOMRect ou elemento */
const center = (rectOrEl) => {
  const r = (rectOrEl instanceof DOMRect || 'left' in rectOrEl)
    ? rectOrEl
    : rectOrEl.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** Ease in-out quadrática */
const easeInOut = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

/** Ease out cúbica (desacelera ao pousar) */
const easeOut3 = (t) => 1 - Math.pow(1 - t, 3);

// ─────────────────────────────────────────────────────────────
// Fábrica de elemento ghost
// ─────────────────────────────────────────────────────────────

/**
 * Cria um div ghost posicionado em `pos` com uma imagem de carta.
 * @param {{ x: number, y: number }} pos
 * @param {string} imgSrc
 * @param {number} [width=60]
 * @returns {HTMLElement}
 */
function makeGhost(pos, imgSrc, width = 60) {
  const ghost = document.createElement('div');
  ghost.style.cssText = `
    position: fixed;
    left: ${pos.x}px;
    top:  ${pos.y}px;
    width: ${width}px;
    aspect-ratio: 2 / 3;
    transform: translate(-50%, -50%);
    z-index: 99999;
    pointer-events: none;
    border-radius: 7px;
    overflow: hidden;
    box-shadow: 0 6px 18px rgba(0,0,0,0.65);
    will-change: transform, opacity;
  `;
  const img = document.createElement('img');
  img.src = imgSrc;
  img.draggable = false;
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
  ghost.append(img);
  document.body.append(ghost);
  return ghost;
}

// ─────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────

/**
 * Anima uma carta (verso) do painel de escolha até o avatar do ladrão.
 * Voo lento e suave — o jogador que roubou a carta vê ela chegando ao seu avatar.
 *
 * @param {DOMRect} fromRect  — rect do item clicado no opp-pick-panel
 * @param {HTMLElement} toEl  — player-badge do ladrão
 */
export function flyCardToAvatar(fromRect, toEl) {
  if (!fromRect || !toEl) return;

  const from = center(fromRect);
  const to   = center(toEl.getBoundingClientRect());

  // Ponto de controle: arco suave acima do ponto médio
  const ctrl = {
    x: lerp(from.x, to.x, 0.45),
    y: Math.min(from.y, to.y) - Math.abs(from.y - to.y) * 0.25 - 50,
  };

  const ghost = makeGhost(from, 'img/carta_verso.png', 64);
  const DURATION = 820;
  const start = performance.now();

  const tick = (now) => {
    const raw  = Math.min((now - start) / DURATION, 1);
    const t    = easeOut3(raw);
    const pt   = bezier2(from, ctrl, to, t);
    const scl  = lerp(1, 0.55, raw);
    const opac = raw > 0.78 ? lerp(1, 0, (raw - 0.78) / 0.22) : 1;

    ghost.style.left      = `${pt.x}px`;
    ghost.style.top       = `${pt.y}px`;
    ghost.style.transform = `translate(-50%, -50%) scale(${scl.toFixed(3)})`;
    ghost.style.opacity   = opac.toFixed(3);

    if (raw < 1) requestAnimationFrame(tick);
    else ghost.remove();
  };
  requestAnimationFrame(tick);
}

/**
 * Anima uma carta (verso) saindo do avatar do DONO (fromEl)
 * e voando até o avatar do LADRÃO (toEl), com arco mais alto
 * e movimento bem mais devagar para dar drama ao roubo.
 *
 * @param {HTMLElement} fromEl  — player-badge do dono das cartas
 * @param {HTMLElement} toEl    — player-badge do jogador que roubou
 * @param {string} [cardImg='img/carta_verso.png']  imagem da carta (verso)
 */
export function flyCardBetweenAvatars(fromEl, toEl, cardImg = 'img/carta_verso.png', onLand = null) {
  if (!fromEl || !toEl) return;

  const from = center(fromEl.getBoundingClientRect());
  const to   = center(toEl.getBoundingClientRect());

  // Arco bem alto — carta sobe antes de chegar ao destino
  const mx = lerp(from.x, to.x, 0.5);
  const my = Math.min(from.y, to.y) - Math.abs(from.y - to.y) * 0.6 - 80;
  const ctrl = { x: mx, y: my };

  const ghost = makeGhost(from, cardImg, 68);
  ghost.style.border     = '2px solid rgba(255,220,100,0.7)';
  ghost.style.boxShadow  = '0 0 14px rgba(255,200,60,0.5), 0 4px 16px rgba(0,0,0,0.6)';

  const DURATION = 1150; // mais lento — dá para ver o voo
  const start = performance.now();

  const tick = (now) => {
    const raw  = Math.min((now - start) / DURATION, 1);
    const t    = easeInOut(raw);
    const pt   = bezier2(from, ctrl, to, t);
    // leve rotação no voo
    const rot  = Math.sin(raw * Math.PI) * 18;
    const scl  = 1 + Math.sin(raw * Math.PI) * 0.18; // cresce no meio do arco
    const opac = raw > 0.76 ? lerp(1, 0, (raw - 0.76) / 0.24) : 1;

    ghost.style.left      = `${pt.x}px`;
    ghost.style.top       = `${pt.y}px`;
    ghost.style.transform = `translate(-50%, -50%) scale(${scl.toFixed(3)}) rotate(${rot.toFixed(1)}deg)`;
    ghost.style.opacity   = opac.toFixed(3);

    if (raw < 1) requestAnimationFrame(tick);
    else { ghost.remove(); onLand?.(); }
  };
  requestAnimationFrame(tick);
}

/**
 * Anima um par de cartas (faces reveladas) saindo do avatar do jogador,
 * rodeando um lado, e pousando no botão de pares.
 *
 * @param {{ faceImage: string, name?: string }[]} pair   — as 2 cartas
 * @param {HTMLElement} fromEl   — .player-badge do jogador
 * @param {HTMLElement} toEl     — .pairs-badge (botão de pares)
 * @param {() => void}  onDone   — chamado quando as duas chegam ao destino
 */
export function animatePairArcToButton(pair, fromEl, toEl, onDone) {
  if (!fromEl || !toEl || !pair?.length) { onDone?.(); return; }

  const fromRect   = fromEl.getBoundingClientRect();
  const fromCenter = center(fromRect);
  const toCenter   = center(toEl.getBoundingClientRect());

  // Raio para o arco — rodeia o avatar antes de ir ao botão
  const rx = fromRect.width  * 0.9 + 20;
  const ry = fromRect.height * 0.9 + 20;

  // Carta A: arco pelo lado esquerdo-superior
  const ctrlA = { x: fromCenter.x - rx, y: fromCenter.y - ry };
  // Carta B: arco pelo lado direito-superior
  const ctrlB = { x: fromCenter.x + rx, y: fromCenter.y - ry };

  const DURATION = 860;
  let doneCount  = 0;

  const checkDone = () => { if (++doneCount >= 2) onDone?.(); };

  [0, 1].forEach((i) => {
    const cardImg = pair[i]?.faceImage ?? 'img/carta_verso.png';
    const ctrl    = i === 0 ? ctrlA : ctrlB;
    const delay   = i * 65;   // 2ª carta sai 65ms depois

    const ghost   = makeGhost(fromCenter, cardImg, 54);

    // Brilho dourado nas cartas do par
    ghost.style.border     = '2px solid rgba(255,210,0,0.85)';
    ghost.style.boxShadow  = '0 0 12px rgba(255,180,0,0.6), 0 4px 14px rgba(0,0,0,0.5)';

    const startTime = performance.now() + delay;

    const tick = (now) => {
      const elapsed = now - startTime;
      if (elapsed < 0) { requestAnimationFrame(tick); return; }

      const raw  = Math.min(elapsed / DURATION, 1);
      const t    = easeInOut(raw);
      const pt   = bezier2(fromCenter, ctrl, toCenter, t);
      const scl  = lerp(1.12, 0.45, t);
      const rot  = i === 0 ? t * -30 : t * 30;
      const opac = raw > 0.72 ? lerp(1, 0, (raw - 0.72) / 0.28) : 1;

      ghost.style.left      = `${pt.x}px`;
      ghost.style.top       = `${pt.y}px`;
      ghost.style.transform = `translate(-50%, -50%) scale(${scl.toFixed(3)}) rotate(${rot.toFixed(1)}deg)`;
      ghost.style.opacity   = opac.toFixed(3);

      if (raw < 1) requestAnimationFrame(tick);
      else { ghost.remove(); checkDone(); }
    };
    requestAnimationFrame(tick);
  });
}
