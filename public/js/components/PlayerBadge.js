/**
 * @layer components
 * @group game
 * @role Component
 * @depends Dom
 * @exports PlayerBadge
 *
 * Componente que exibe um jogador: avatar circular + nome.
 * Usado para badges de posição na mesa (top, bottom, left, etc).
 */

import { Dom }       from '../utils/Dom.js';
import { AppConfig } from '../config/AppConfig.js';

/** Resolve URL do avatar para o ambiente atual (dev = direto, prod = proxy). */
const resolveAvatarUrl = (url) => AppConfig.avatarProxyUrl(url);

export class PlayerBadge {
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

  /**
   * @param {string} uid
   * @param {string} name
   * @param {string|null} avatarUrl
   * @param {string} positionKey
   * @param {boolean} [isMe=false]
   */
  constructor(uid, name, avatarUrl, positionKey, isMe = false) {
    this.#uid = uid;
    this.#name = name;
    this.#avatarUrl = avatarUrl;
    this.#positionKey = positionKey;
    this.#isMe = isMe;
  }

  /**
   * Cria o elemento DOM do badge.
   * @returns {HTMLElement}
   */
  create() {
    const wrapper = Dom.create('div', {
      classes: ['player-badge', `player-badge--${this.#positionKey}`, this.#isMe ? 'player-badge--me' : ''],
      attrs:   { 'data-uid': this.#uid },
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
        // Fallback para iniciais se imagem falhar
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

    // Nome abaixo
    const nameEl = Dom.create('div', {
      classes: 'player-badge__name',
      text: this.#name
    });
    wrapper.append(nameEl);

    return wrapper;
  }
}
