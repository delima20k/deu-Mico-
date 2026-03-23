/**
 * @layer    utils
 * @group    deck
 * @role     Utility
 * @depends  Card
 * @exports  ShuffleUtils
 *
 * Utilitários de embaralhamento para o baralho "Deu Mico".
 *
 * Algoritmo: Fisher-Yates (Knuth Shuffle) — O(n), imparcial.
 * Atualiza o orderIndex de cada carta para refletir a nova posição.
 *
 * Referência: https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
 */
export class ShuffleUtils {
  constructor() {
    throw new Error('ShuffleUtils não pode ser instanciado — use os métodos estáticos.');
  }

  // -------------------------------------------------------
  // shuffleDeck — embaralhamento principal
  // -------------------------------------------------------

  /**
   * Embaralha o baralho usando Fisher-Yates e atualiza os orderIndex.
   * Não muta o array original — retorna um novo array de Cards.
   *
   * @param {import('../domain/Card.js').Card[]} deck - Baralho a embaralhar
   * @returns {import('../domain/Card.js').Card[]} Novo array embaralhado
   */
  static shuffleDeck(deck) {
    if (!Array.isArray(deck) || deck.length === 0) {
      throw new Error('[ShuffleUtils] shuffleDeck requer um array não-vazio.');
    }

    // Copia superficial para não mutar o original
    const arr = [...deck];

    // Fisher-Yates: itera de trás para frente
    for (let i = arr.length - 1; i > 0; i--) {
      const j      = ShuffleUtils.#randomInt(0, i);
      const temp   = arr[i];
      arr[i]       = arr[j];
      arr[j]       = temp;
    }

    // Atualiza o orderIndex de cada carta para refletir a posição final
    return arr.map((card, index) => card.withOrderIndex(index));
  }

  // -------------------------------------------------------
  // shuffleMultiple — embaralha N vezes para maior entropia
  // -------------------------------------------------------

  /**
   * Aplica shuffleDeck múltiplas vezes.
   * Útil para simular o embaralhamento manual de múltiplos cortes.
   *
   * @param {import('../domain/Card.js').Card[]} deck
   * @param {number} [times=3]
   * @returns {import('../domain/Card.js').Card[]}
   */
  static shuffleMultiple(deck, times = 3) {
    let result = deck;
    for (let i = 0; i < times; i++) {
      result = ShuffleUtils.shuffleDeck(result);
    }
    console.log(`[ShuffleUtils] 🔀 Baralho embaralhado ${times}×`);
    return result;
  }

  // -------------------------------------------------------
  // cutDeck — simula corte do baralho
  // -------------------------------------------------------

  /**
   * Simula um corte aleatório do baralho (move o ponto de corte para o início).
   *
   * @param {import('../domain/Card.js').Card[]} deck
   * @returns {import('../domain/Card.js').Card[]}
   */
  static cutDeck(deck) {
    if (deck.length < 2) return [...deck];

    const cutPoint = ShuffleUtils.#randomInt(1, deck.length - 1);
    const cut      = [...deck.slice(cutPoint), ...deck.slice(0, cutPoint)];
    return cut.map((card, index) => card.withOrderIndex(index));
  }

  // -------------------------------------------------------
  // Privados
  // -------------------------------------------------------

  /**
   * Inteiro aleatório criptograficamente seguro no intervalo [min, max].
   * Usa crypto.getRandomValues quando disponível; fallback para Math.random.
   *
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  static #randomInt(min, max) {
    const range = max - min + 1;

    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      // Inteiro aleatório com crypto API (browsers modernos e Node ≥ 19)
      const bytes  = new Uint32Array(1);
      crypto.getRandomValues(bytes);
      return min + (bytes[0] % range);
    }

    // Fallback seguro para ambientes sem crypto
    return min + Math.floor(Math.random() * range);
  }
}
