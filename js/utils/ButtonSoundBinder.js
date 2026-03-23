/**
 * @layer    utils
 * @group    audio
 * @role     UI
 * @depends  AudioService
 * @exports  bindButtonSounds
 *
 * Aplica sons globalmente em todos os botões do app via event delegation.
 *
 * Regras:
 *  • Qualquer <button> ou elemento com role="button" toca 'btn-tap' (made.mp3).
 *  • Botões que confirmam uma ação importante tocam 'btn-confirm' (confirm_action.mp3).
 *
 * Botões de confirmação reconhecidos:
 *  - .btn-primary                            → login / cadastro
 *  - .btn-google                             → autenticação Google
 *  - .lobby-card__button                     → entrar na fila de uma sala
 *  - .tournament-card__join-btn              → participar de um campeonato
 *  - .hm-pair-modal__btn--ok                 → confirmar formação de par
 *  - .exit-confirm-modal__btn--yes           → confirmar saída da partida
 *  - .deck-action-panel__btn (não bloqueado) → embaralhar / entregar cartas
 *
 * Para silenciar um botão específico, adicione o atributo data-nosound="true".
 */
import { AudioService } from '../services/AudioService.js';

// -------------------------------------------------------
// Seletores de botões de confirmação
// -------------------------------------------------------
const CONFIRM_SELECTORS = [
  '.btn-primary',
  '.btn-google',
  '.lobby-card__button',
  '.tournament-card__join-btn',
  '.hm-pair-modal__btn--ok',
  '.exit-confirm-modal__btn--yes',
  '.deck-action-panel__btn:not(.deck-action-panel__btn--locked)',
].join(', ');

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

/**
 * Sobe na árvore DOM até 3 níveis do target do clique procurando um botão.
 * Cobre cliques em ícones/spans filhos de <button>.
 *
 * @param {EventTarget} target
 * @returns {HTMLElement|null}
 */
function closestButton(target) {
  let el = /** @type {HTMLElement} */ (target);
  for (let i = 0; i < 3 && el; i++, el = el.parentElement) {
    if (
      el.tagName === 'BUTTON' ||
      (el.getAttribute && el.getAttribute('role') === 'button')
    ) return el;
  }
  return null;
}

// -------------------------------------------------------
// API pública
// -------------------------------------------------------

/**
 * Registra o listener global de sons para botões.
 * Deve ser chamado UMA ÚNICA VEZ durante o boot da aplicação (App.bootstrap).
 */
export function bindButtonSounds() {
  const svc = AudioService.getInstance();

  document.addEventListener('click', (e) => {
    const btn = closestButton(e.target);

    // Ignora: não é botão, está desabilitado, ou tem data-nosound="true"
    if (!btn || btn.disabled || btn.dataset.nosound === 'true') return;

    if (btn.matches(CONFIRM_SELECTORS)) {
      svc.play('btn-confirm');
    } else {
      svc.play('btn-tap');
    }
  }, { capture: true }); // capture=true garante que o listener dispara ANTES dos handlers individuais
}
