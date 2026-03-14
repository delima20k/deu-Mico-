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

import { UserRepository }         from '../repositories/UserRepository.js';
import { Player }                  from '../domain/Player.js';
import { YoungestPlayerResolver }  from '../domain/YoungestPlayerResolver.js';

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

    // Delega ao resolver de domínio puro (sem Firebase)
    const winner = YoungestPlayerResolver.findYoungest(candidates);

    console.log(
      `[DealerSelection] youngest uid=${winner.id} age=${winner.resolvedAge}`
    );

    return {
      youngestPlayerUid:  winner.id,
      youngestPlayerName: winner.name,
      youngestAge:        winner.resolvedAge,
      youngestPlayer:     winner,   // Player instance para uso no ShuffleController
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
      const player = Player.fromProfile(profile, { joinedAt: players[index].joinedAt ?? 0 });
      console.log(`[DealerSelection] candidate uid=${player.id} age=${player.resolvedAge}`);
      return player;
    });
  }
}
