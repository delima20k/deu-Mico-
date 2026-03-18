/**
 * @layer components
 * @group game
 * @role Component
 * @depends Dom
 * @exports PlayerScoreBadge
 *
 * Componente que exibe um jogador com score/pontuação.
 * Similiar a PlayerBadge mas com exibição de pontos.
 * Usado em modo tournament.
 */

import { Dom } from '../utils/Dom.js';

/**
 * Roteia URLs do Google através do proxy para evitar 429 e CORS.
 * Em localhost, usa a URL diretamente (sem proxy).
 * @param {string|null} url
 * @returns {string|null}
 */
function resolveAvatarUrl(url) {
  if (!url) return null;
  if (url.includes('googleusercontent.com')) {
    const isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (isLocalhost) return url;
    return `/api/avatar-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export class PlayerScoreBadge {
  /** @type {string} UID do jogador */
  #uid;

  /** @type {string} Nome do jogador */
  #name;

  /** @type {string|null} URL do avatar */
  #avatarUrl;

  /** @type {string} Posição visual na mesa (bottom, top, left, etc) */
  #positionKey;

  /** @type {boolean} Se é o jogador atual (logado) */
  #isMe;

  /** @type {number} Pontuação do jogador */
  #score;

  /**
   * @param {string} uid
   * @param {string} name
   * @param {string|null} avatarUrl
   * @param {string} positionKey
   * @param {boolean} [isMe=false]
   * @param {number} [score=0]
   */
  constructor(uid, name, avatarUrl, positionKey, isMe = false, score = 0) {
    this.#uid = uid;
    this.#name = name;
    this.#avatarUrl = avatarUrl;
    this.#positionKey = positionKey;
    this.#isMe = isMe;
    this.#score = score;
  }

  /**
   * Cria o elemento DOM do badge com score.
   * @returns {HTMLElement}
   */
  create() {
    const wrapper = Dom.create('div', {
      classes: ['player-badge', `player-badge--${this.#positionKey}`, this.#isMe ? 'player-badge--me' : '']
    });

    // Avatar circular
    const avatarEl = Dom.create('div', { classes: 'player-badge__avatar' });

    const resolvedUrl = resolveAvatarUrl(this.#avatarUrl);
    if (resolvedUrl) {
      const imgEl = Dom.create('img', {
        attrs: {
          src: resolvedUrl,
          alt: this.#name,
          loading: 'lazy',
        }
      });
      imgEl.addEventListener('error', () => {
        avatarEl.innerHTML = '';
        const initials = Dom.create('div', {
          classes: 'player-badge__initials',
          text: (this.#name[0] || '?').toUpperCase()
        });
        avatarEl.append(initials);
      });
      avatarEl.append(imgEl);
    } else {
      const initials = Dom.create('div', {
        classes: 'player-badge__initials',
        text: (this.#name[0] || '?').toUpperCase()
      });
      avatarEl.append(initials);
    }

    wrapper.append(avatarEl);

    // Score (acima do avatar, pequeno)
    if (this.#score > 0 || this.#isMe) {
      const scoreEl = Dom.create('div', {
        classes: 'player-badge__score',
        text: `${this.#score} pts`
      });
      wrapper.append(scoreEl);
    }

    // Nome abaixo
    const nameEl = Dom.create('div', {
      classes: 'player-badge__name',
      text: this.#name
    });
    wrapper.append(nameEl);

    return wrapper;
  }
}
