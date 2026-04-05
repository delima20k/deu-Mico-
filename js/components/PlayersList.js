/**
 * @layer components
 * @group match
 * @role UI
 * @depends Dom
 * @exports PlayersList
 *
 * Lista de jogadores em uma sala/partida.
 * Exibe: avatares, nomes, status (pronto/aguardando).
 */
import { Dom } from '../utils/Dom.js';

export class PlayersList {
  /** @type {Object} players - { userId: { name, avatarUrl, ready: bool } } */
  #players = {};

  /** @type {HTMLElement|null} */
  #el = null;

  /**
   * @param {Object} [initialPlayers={}]
   */
  constructor(initialPlayers = {}) {
    this.#players = { ...initialPlayers };
  }

  /**
   * Cria e retorna o elemento da lista.
   * @returns {HTMLElement}
   */
  create() {
    const container = Dom.create('div', { classes: 'players-list' });

    const title = Dom.create('h3', {
      classes: 'players-list__title',
      text: 'Jogadores',
    });

    const list = Dom.create('div', { classes: 'players-list__items' });
    this.#renderPlayers(list);

    container.append(title, list);
    this.#el = container;
    return container;
  }

  /**
   * Renderiza jogadores na lista.
   * @private
   */
  #renderPlayers(container) {
    container.innerHTML = '';

    Object.entries(this.#players).forEach(([userId, player]) => {
      const item = Dom.create('div', { classes: 'players-list__item' });

      // Avatar
      const avatar = Dom.create('img', {
        classes: 'players-list__avatar',
        attrs: {
          src: player.avatarUrl || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23ccc%22/%3E%3C/svg%3E',
          alt: player.name,
        },
      });

      // Nome
      const name = Dom.create('p', {
        classes: 'players-list__name',
        text: player.name || 'Jogador',
      });

      // Status (pronto/aguardando)
      const status = Dom.create('span', {
        classes: [
          'players-list__status',
          player.ready ? 'players-list__status--ready' : 'players-list__status--waiting',
        ],
        text: player.ready ? '✓ Pronto' : '⏳ Aguardando',
      });

      item.append(avatar, name, status);
      container.append(item);
    });
  }

  /**
   * Adiciona ou atualiza um jogador.
   * @param {string} userId
   * @param {Object} player - { name, avatarUrl, ready }
   */
  setPlayer(userId, player) {
    this.#players[userId] = player;
    this.#updateRender();
  }

  /**
   * Remove um jogador.
   * @param {string} userId
   */
  removePlayer(userId) {
    delete this.#players[userId];
    this.#updateRender();
  }

  /**
   * Marca jogador como pronto.
   * @param {string} userId
   */
  markReady(userId) {
    if (this.#players[userId]) {
      this.#players[userId].ready = true;
      this.#updateRender();
    }
  }

  /**
   * Atualiza a renderização.
   * @private
   */
  #updateRender() {
    if (this.#el) {
      const list = this.#el.querySelector('.players-list__items');
      if (list) {
        this.#renderPlayers(list);
      }
    }
  }

  /**
   * @returns {HTMLElement|null}
   */
  getElement() {
    return this.#el;
  }
}
