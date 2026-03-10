/**
 * @layer    services
 * @group    game
 * @role     Service
 * @depends  UserRepository
 * @exports  DealerSelectionService
 *
 * Serviço de seleção do dealer (responsável por embaralhar).
 * Identifica o jogador mais novo da partida com base no campo `age`
 * do seu UserProfile.
 *
 * Regras:
 *   1. Menor idade → selecionado.
 *   2. Empate em idade → menor `joinedAt` vence.
 *   3. Empate em `joinedAt` → uid em ordem alfabética crescente.
 *   4. Jogador sem idade cadastrada (null) → idade tratada como Infinity.
 *
 * Sem manipulação de DOM.
 */

import { UserRepository } from '../repositories/UserRepository.js';

export class DealerSelectionService {
  /** @type {DealerSelectionService|null} */
  static #instance = null;

  /** @type {UserRepository} */
  #userRepository;

  constructor() {
    this.#userRepository = UserRepository.getInstance();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Singleton
  // ─────────────────────────────────────────────────────────────────────────

  static getInstance() {
    if (!DealerSelectionService.#instance) {
      DealerSelectionService.#instance = new DealerSelectionService();
    }
    return DealerSelectionService.#instance;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Determina o jogador mais novo entre os participantes da partida.
   *
   * @param {Array<{ uid: string, joinedAt: number }>} players
   *   Lista de jogadores. `joinedAt` é timestamp (ms) de entrada na sala.
   *
   * @returns {Promise<{
   *   youngestPlayerUid:  string,
   *   youngestPlayerName: string,
   *   youngestAge:        number
   * }>}
   */
  async resolveYoungestPlayer(players) {
    console.log('[DealerSelection] resolving youngest player...');

    if (!players || players.length === 0) {
      throw new Error('[DealerSelection] lista de jogadores vazia ou inválida');
    }

    // Carrega perfis em paralelo para minimizar latência
    const candidates = await this.#buildCandidates(players);

    // Ordena conforme as regras de desempate e pega o primeiro
    candidates.sort(DealerSelectionService.#compareByAge);

    const winner = candidates[0];

    console.log(
      `[DealerSelection] youngest uid=${winner.uid} age=${winner.age}`
    );

    return {
      youngestPlayerUid:  winner.uid,
      youngestPlayerName: winner.name,
      youngestAge:        winner.age,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Busca os perfis de todos os jogadores e monta a lista de candidatos.
   * @param {Array<{ uid: string, joinedAt: number }>} players
   * @returns {Promise<Array<{ uid: string, name: string, age: number, joinedAt: number }>>}
   */
  async #buildCandidates(players) {
    const profilePromises = players.map(p => this.#userRepository.getProfile(p.uid));
    const profiles = await Promise.all(profilePromises);

    return profiles.map((profile, index) => {
      const rawAge = profile.age;
      // Idade ausente → Infinity (nunca será o mais novo)
      const age = (rawAge !== null && rawAge !== undefined && Number.isFinite(rawAge))
        ? rawAge
        : Infinity;

      console.log(`[DealerSelection] candidate uid=${profile.uid} age=${age}`);

      return {
        uid:      profile.uid,
        name:     profile.name,
        age,
        joinedAt: players[index].joinedAt ?? 0,
      };
    });
  }

  /**
   * Função de comparação para ordenar candidatos.
   * Critérios em ordem de prioridade:
   *   1. Menor idade
   *   2. Menor joinedAt (entrou primeiro na sala)
   *   3. uid em ordem alfabética crescente
   *
   * @param {{ uid: string, age: number, joinedAt: number }} a
   * @param {{ uid: string, age: number, joinedAt: number }} b
   * @returns {number}
   */
  static #compareByAge(a, b) {
    if (a.age !== b.age)           return a.age      - b.age;
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
    return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
  }
}
