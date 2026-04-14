/**
 * @layer    services
 * @group    deck
 * @role     Barrel / Facade
 * @depends  Card, DeckConfig, DeckBuilderService, DeckValidator, ShuffleUtils
 * @exports  buildAndShuffleDeck, buildDeck, validateDeck, shuffleDeck
 *
 * Ponto de entrada único para o módulo de baralho.
 * Importar deste arquivo expõe toda a API do deck sem precisar
 * lembrar de onde cada módulo vive.
 *
 * ── Uso rápido ────────────────────────────────────────────────────────────
 *
 *   import { buildAndShuffleDeck } from './services/deck.js';
 *
 *   const deck = buildAndShuffleDeck();
 *   // deck: Card[67] — embaralhado, orderIndex atualizado, pronto para distribuir
 *
 * ── API completa ──────────────────────────────────────────────────────────
 *
 *   buildDeck()                      → Card[67] não embaralhado
 *   shuffleDeck(deck)                → Card[67] embaralhado (Fisher-Yates)
 *   shuffleMultiple(deck, times)     → Card[67] embaralhado N vezes
 *   cutDeck(deck)                    → Card[67] com corte aleatório
 *   validateDeck(deck)               → { valid, errors, warnings, report }
 *   buildAndShuffleDeck()            → Card[67] pronto para uso
 *
 * ─────────────────────────────────────────────────────────────────────────
 */
export { Card }                from '../domain/Card.js';
export { DeckConfig }          from '../domain/DeckConfig.js';
export { DeckBuilderService }  from './DeckBuilderService.js';
export { DeckValidator }       from '../utils/DeckValidator.js';
export { ShuffleUtils }        from '../utils/ShuffleUtils.js';

// Re-exporta métodos mais usados como funções de conveniência
import { DeckBuilderService }  from './DeckBuilderService.js';
import { DeckValidator }       from '../utils/DeckValidator.js';
import { ShuffleUtils }        from '../utils/ShuffleUtils.js';

/**
 * Constrói o baralho completo (69 cartas) sem embaralhar.
 * @returns {import('../domain/Card.js').Card[]}
 */
export const buildDeck = () => DeckBuilderService.buildDeck();

/**
 * Embaralha um baralho com Fisher-Yates (1 passagem).
 * @param {import('../domain/Card.js').Card[]} deck
 * @returns {import('../domain/Card.js').Card[]}
 */
export const shuffleDeck = (deck) => ShuffleUtils.shuffleDeck(deck);

/**
 * Embaralha um baralho N vezes.
 * @param {import('../domain/Card.js').Card[]} deck
 * @param {number} [times=3]
 * @returns {import('../domain/Card.js').Card[]}
 */
export const shuffleMultiple = (deck, times = 3) => ShuffleUtils.shuffleMultiple(deck, times);

/**
 * Corta o baralho em um ponto aleatório.
 * @param {import('../domain/Card.js').Card[]} deck
 * @returns {import('../domain/Card.js').Card[]}
 */
export const cutDeck = (deck) => ShuffleUtils.cutDeck(deck);

/**
 * Valida a integridade de um baralho.
 * @param {import('../domain/Card.js').Card[]} deck
 * @returns {{ valid: boolean, errors: string[], warnings: string[], report: Object }}
 */
export const validateDeck = (deck) => DeckValidator.validateDeck(deck);

/**
 * Atalho principal: constrói + embaralha 3× + valida + retorna baralho pronto.
 * Lança erro se a validação falhar.
 *
 * @returns {import('../domain/Card.js').Card[]}
 */
export function buildAndShuffleDeck() {
  const raw       = DeckBuilderService.buildDeck();
  const shuffled  = ShuffleUtils.shuffleMultiple(raw, 3);
  const result    = DeckValidator.validateDeck(shuffled);

  if (!result.valid) {
    throw new Error(
      '[deck] Baralho inválido após construção:\n' + result.errors.join('\n')
    );
  }

  return shuffled;
}
