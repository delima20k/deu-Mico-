/**
 * @layer components
 * @group tournament
 * @role UI
 * @depends Dom, SoundManager
 * @exports TournamentCard
 *
 * Card para exibir torneio atual e botão participar.
 * Mostra: nome, data, prêmio, botão participar.
 */
import { Dom } from '../utils/Dom.js';
import { SoundManager } from '../utils/SoundManager.js';

export class TournamentCard {
  /** @type {Object} tournament - { id, name, startDate, prize, enrolledCount } */
  #tournament;

  /** @type {Function|null} */
  #onJoin = null;

  /** @type {HTMLElement|null} */
  #el = null;

  /**
   * @param {Object} options
   * @param {Object} options.tournament - dados do torneio
   * @param {Function} [options.onJoin] - callback ao participar
   */
  constructor({ tournament, onJoin = null }) {
    this.#tournament = tournament;
    this.#onJoin = onJoin;
  }

  /**
   * Cria e retorna o elemento do card.
   * @returns {HTMLElement}
   */
  create() {
    const card = Dom.create('div', { classes: 'tournament-card' });

    // Nome
    const name = Dom.create('h3', {
      classes: 'tournament-card__name',
      text: this.#tournament.name || 'Torneio',
    });

    // Data
    const dateText = new Date(this.#tournament.startDate).toLocaleDateString('pt-BR');
    const date = Dom.create('p', {
      classes: 'tournament-card__date',
      text: `📅 ${dateText}`,
    });

    // Prêmio
    const prize = Dom.create('p', {
      classes: 'tournament-card__prize',
      text: `🏆 Prêmio: ${this.#tournament.prize || 'A definir'}`,
    });

    // Inscritos
    const enrolled = Dom.create('p', {
      classes: 'tournament-card__enrolled',
      text: `👥 ${this.#tournament.enrolledCount || 0} inscritos`,
    });

    // Botão participar
    const btn = Dom.create('button', {
      classes: 'tournament-card__join-btn',
      text: 'PARTICIPAR',
      attrs: { type: 'button' },
    });

    btn.addEventListener('click', () => {
      SoundManager.getInstance().play('made');
      this.#onJoin?.();
    });

    card.append(name, date, prize, enrolled, btn);
    this.#el = card;
    return card;
  }

  /**
   * Atualiza dados do torneio.
   * @param {Object} tournament
   */
  update(tournament) {
    this.#tournament = tournament;
    if (this.#el) {
      const enrolledEl = this.#el.querySelector('.tournament-card__enrolled');
      if (enrolledEl) {
        const enrolledCount = Number(tournament.enrolledCount || 0);
        const maxParticipants = Number(tournament.maxParticipants || 0);
        const suffix = maxParticipants > 0
          ? ` (${enrolledCount}/${maxParticipants})`
          : '';

        enrolledEl.textContent = `👥 ${enrolledCount} inscritos${suffix}`;
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
