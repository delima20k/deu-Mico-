/**
 * @layer    domain
 * @group    game
 * @role     Domain Service
 * @depends  Player
 * @exports  YoungestPlayerResolver
 *
 * Resolver puro de domínio para identificar o jogador mais novo de uma lista.
 *
 * Critérios de seleção (em prioridade decrescente):
 *   1. Menor resolvedAge — calculado a partir de birthDate ou campo age.
 *   2. Menor joinedAt    — entrou mais cedo na sala (desempate em caso de mesma idade).
 *   3. id em ordem alfabética crescente — desempate determinístico.
 *
 * Características:
 *   - 100% síncrono — sem Promises, sem I/O, sem DOM.
 *   - Imutável — não modifica os Players recebidos.
 *   - Não instanciável — apenas métodos estáticos.
 *
 * @example
 *   const players = [
 *     new Player({ id: 'a', name: 'Ana',  age: 28, joinedAt: 100 }),
 *     new Player({ id: 'b', name: 'Bob',  age: 22, joinedAt: 200 }),
 *     new Player({ id: 'c', name: 'Cia',  age: 22, joinedAt: 100 }),
 *   ];
 *   const youngest = YoungestPlayerResolver.findYoungest(players);
 *   // youngest.name === 'Cia' (menor joinedAt no empate de idade)
 */

import { Player } from './Player.js';

export class YoungestPlayerResolver {
  /** Classe utilitária — não instanciável. */
  constructor() {
    throw new Error('YoungestPlayerResolver não pode ser instanciado — use os métodos estáticos.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Retorna o jogador mais novo de uma lista de Players.
   *
   * @param {Player[]} players - Lista de jogadores (mínimo 1).
   * @throws {Error} Se `players` for vazio ou inválido.
   * @returns {Player} O jogador mais novo conforme os critérios acima.
   */
  static findYoungest(players) {
    if (!Array.isArray(players) || players.length === 0) {
      throw new Error('[YoungestPlayerResolver] Lista de jogadores vazia ou inválida.');
    }

    const sorted = YoungestPlayerResolver.sortByAge(players);

    console.log(
      `[YoungestPlayerResolver] Mais novo: ${sorted[0].name} (age=${sorted[0].resolvedAge}, uid=${sorted[0].id})`
    );

    return sorted[0];
  }

  /**
   * Retorna cópia do array ordenada do mais novo para o mais velho.
   * Não muta a lista original.
   *
   * @param {Player[]} players
   * @returns {Player[]}
   */
  static sortByAge(players) {
    return [...players].sort(YoungestPlayerResolver.#compare);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Função de comparação para ordenação.
   * Critérios em ordem de prioridade:
   *   1. Menor resolvedAge
   *   2. Menor joinedAt
   *   3. id em ordem alfabética crescente
   *
   * @param {Player} a
   * @param {Player} b
   * @returns {number}
   */
  static #compare(a, b) {
    const ageA = a.resolvedAge;
    const ageB = b.resolvedAge;

    if (ageA !== ageB)             return ageA      - ageB;
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }
}
