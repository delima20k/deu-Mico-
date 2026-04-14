/**
 * @layer    utils
 * @group    deck
 * @role     Utility
 * @depends  Card, DeckConfig
 * @exports  DeckValidator
 *
 * Valida a integridade estrutural de um baralho "Deu Mico" já construído.
 *
 * Verificações realizadas:
 *   ✅ Total de cartas = 69
 *   ✅ Exatamente 1 carta com isMico = true
 *   ✅ Carta mico não possui par no baralho
 *   ✅ Todas as cartas normais possuem exatamente 1 par
 *   ✅ Todos os pares têm exatamente 2 instâncias (sufixos _A e _B)
 *   ✅ IDs únicos em todo o baralho
 *   ✅ Todos os campos obrigatórios presentes
 *   ✅ Verso = carta_verso.png em todas as cartas
 */
import { DeckConfig } from '../domain/DeckConfig.js';

export class DeckValidator {
  constructor() {
    throw new Error('DeckValidator não pode ser instanciado — use os métodos estáticos.');
  }

  // -------------------------------------------------------
  // validateDeck — validação completa
  // -------------------------------------------------------

  /**
   * Valida o baralho completo, gerando relatório detalhado.
   *
   * @param {import('../domain/Card.js').Card[]} deck
   * @returns {{ valid: boolean, errors: string[], warnings: string[], report: Object }}
   */
  static validateDeck(deck) {
    console.group('[DeckValidator] 🔍 Validando baralho...');

    const errors   = [];
    const warnings = [];

    // ── 1. Total de cartas ────────────────────────────────
    const total          = deck.length;
    const expectedTotal  = DeckConfig.EXPECTED_TOTAL;

    if (total !== expectedTotal) {
      errors.push(`Total de cartas incorreto: ${total} (esperado: ${expectedTotal})`);
    }

    // ── 2. Unicidade de IDs ───────────────────────────────
    const idMap = new Map();
    for (const card of deck) {
      if (idMap.has(card.id)) {
        errors.push(`ID duplicado encontrado: "${card.id}"`);
      }
      idMap.set(card.id, card);
    }

    // ── 3. Carta Mico ─────────────────────────────────────
    const micoCards = deck.filter(c => c.isMico);

    if (micoCards.length === 0) {
      errors.push('Carta Mico ausente no baralho.');
    } else if (micoCards.length > 1) {
      errors.push(`Múltiplas cartas Mico encontradas: ${micoCards.length} (esperado: 1)`);
    }

    // Verifica que o Mico não tem par
    if (micoCards.length === 1) {
      const mico            = micoCards[0];
      const micoPartnerCount = deck.filter(c => c.pairId === mico.pairId && !c.isMico).length;
      if (micoPartnerCount > 0) {
        errors.push(`Carta Mico possui par indevido no baralho (${micoPartnerCount} carta(s) com pairId='${mico.pairId}').`);
      }
    }

    // ── 4. Verificação dos pares normais ──────────────────
    const normalCards = deck.filter(c => !c.isMico);

    // Agrupa por pairId
    const pairGroups = new Map();
    for (const card of normalCards) {
      if (!pairGroups.has(card.pairId)) pairGroups.set(card.pairId, []);
      pairGroups.get(card.pairId).push(card);
    }

    const totalPairs = pairGroups.size;
    if (totalPairs !== DeckConfig.EXPECTED_PAIRS) {
      errors.push(`Número de pares: ${totalPairs} (esperado: ${DeckConfig.EXPECTED_PAIRS})`);
    }

    for (const [pairId, cards] of pairGroups) {
      if (cards.length !== 2) {
        errors.push(`Par "${pairId}" tem ${cards.length} carta(s) (esperado: 2)`);
      }
    }

    // ── 5. Campos obrigatórios e verso correto ─────────────
    const backExpected = DeckConfig.BACK_IMAGE;
    for (const card of deck) {
      if (!card.id || !card.pairId || !card.name || !card.faceImage) {
        errors.push(`Carta com campos obrigatórios ausentes: id="${card.id}"`);
      }
      if (card.backImage !== backExpected) {
        errors.push(`Carta "${card.id}" usa verso incorreto: "${card.backImage}" (esperado: "${backExpected}")`);
      }
    }

    // ── 6. Cartas isFaceUp ou isMatched no início ─────────
    const faceUpCount  = deck.filter(c => c.isFaceUp).length;
    const matchedCount = deck.filter(c => c.isMatched).length;
    if (faceUpCount > 0) {
      warnings.push(`${faceUpCount} carta(s) estão com isFaceUp=true. Baralho inicial deve ter todas viradas para baixo.`);
    }
    if (matchedCount > 0) {
      warnings.push(`${matchedCount} carta(s) estão com isMatched=true. Baralho inicial não deve ter pares formados.`);
    }

    // ── Resultado final ───────────────────────────────────
    const valid = errors.length === 0;

    const report = {
      total,
      totalNormal:     normalCards.length,
      totalPairs,
      micoCount:       micoCards.length,
      uniqueIds:       idMap.size,
      valid,
      errors,
      warnings,
    };

    // Logs de depuração
    if (valid) {
      console.log('[DeckValidator] ✅ Baralho válido!');
    } else {
      errors.forEach(e => console.error('[DeckValidator] ❌', e));
    }
    if (warnings.length) {
      warnings.forEach(w => console.warn('[DeckValidator] ⚠️', w));
    }

    console.table({
      'Total de cartas':    total,
      'Cartas normais':     normalCards.length,
      'Pares':              totalPairs,
      'Cartas Mico':        micoCards.length,
      'IDs únicos':         idMap.size,
      'Válido':             valid ? 'SIM ✅' : 'NÃO ❌',
    });

    console.groupEnd();
    return { valid, errors, warnings, report };
  }

  // -------------------------------------------------------
  // Helpers públicos adicionais
  // -------------------------------------------------------

  /**
   * Verifica rapidamente (sem relatório completo) se um baralho está íntegro.
   * @param {import('../domain/Card.js').Card[]} deck
   * @returns {boolean}
   */
  static isValid(deck) {
    return DeckValidator.validateDeck(deck).valid;
  }
}
