/**
 * @layer    services
 * @group    deck
 * @role     Service
 * @depends  Card, DeckConfig
 * @exports  DeckBuilderService
 *
 * Serviço responsável pela construção completa do baralho "Deu Mico".
 *
 * Fluxo principal (buildDeck):
 *   1. validateBaseList()   — verifica inconsistências nos assets
 *   2. duplicatePairs()     — 34 cartas normais → 68 cartas (2 de cada)
 *   3. injectMico()         — adiciona a única carta do Mico
 *   4. assignOrderIndex()   — numera as cartas na ordem atual
 *   Total: 69 cartas antes do embaralhamento
 *
 * O embaralhamento é responsabilidade de ShuffleUtils (separação de concerns).
 * Classe utilitária estática — não instanciável, sem estado.
 */
import { Card }       from '../domain/Card.js';
import { DeckConfig } from '../domain/DeckConfig.js';

export class DeckBuilderService {
  constructor() {
    throw new Error('DeckBuilderService não pode ser instanciado — use os métodos estáticos.');
  }

  // -------------------------------------------------------
  // buildDeck — ponto de entrada público
  // -------------------------------------------------------

  /**
   * Constrói o baralho completo (não embaralhado).
   *
   * Retorna array de 69 Cards:
   *   - 68 cartas normais (34 pares)
   *   - 1 carta_mico única
   *
   * @returns {Card[]}
   */
  static buildDeck() {
    console.group('[DeckBuilderService] 🃏 Construindo baralho...');

    // 1. Valida lista base — loga avisos/erros detectados
    const validation = DeckConfig.validateBaseList();

    if (!validation.valid) {
      console.error('[DeckBuilderService] ❌ Lista base inválida. Verifique os erros acima.');
      console.groupEnd();
      throw new Error('[DeckBuilderService] Construção abortada: lista base inválida.');
    }

    // 2. Gera 68 cartas normais (34 × 2)
    const normalCards = DeckBuilderService.duplicatePairs();
    console.log(`[DeckBuilderService] ♻️  Pares gerados: ${normalCards.length / 2} pares → ${normalCards.length} cartas normais`);

    // 3. Injeta carta única do Mico
    const deckWithMico = DeckBuilderService.injectMico(normalCards);
    console.log(`[DeckBuilderService] 🃏 Mico injetado → total: ${deckWithMico.length} cartas`);

    // 4. Atribui orderIndex sequencial inicial (pré-embaralhamento)
    const deck = DeckBuilderService.#assignOrderIndex(deckWithMico);

    console.log(`[DeckBuilderService] ✅ Baralho pronto: ${deck.length} cartas (esperado: ${DeckConfig.EXPECTED_TOTAL})`);
    console.groupEnd();

    return deck;
  }

  // -------------------------------------------------------
  // duplicatePairs — 34 cartas base → 68 cartas
  // -------------------------------------------------------

  /**
   * Duplica cada carta da lista base para formar pares.
   * Cada par compartilha o mesmo pairId.
   * Sufixos _A e _B diferenciam as duas instâncias de um par.
   *
   * @returns {Card[]} Array de 68 Cards normais
   */
  static duplicatePairs() {
    const baseList  = DeckConfig.BASE_NORMAL_CARDS;
    const backImage = DeckConfig.BACK_IMAGE;
    const result    = [];

    for (const entry of baseList) {
      const pairId = entry.key; // pairId = chave da carta (ex: 'jacare')

      // Instância A do par
      result.push(new Card({
        id:         `${entry.key}_A`,
        pairId,
        name:       entry.label,
        faceImage:  DeckConfig.faceImagePath(entry.key),
        backImage,
        isMico:     false,
      }));

      // Instância B do par
      result.push(new Card({
        id:         `${entry.key}_B`,
        pairId,
        name:       entry.label,
        faceImage:  DeckConfig.faceImagePath(entry.key),
        backImage,
        isMico:     false,
      }));
    }

    return result;
  }

  // -------------------------------------------------------
  // injectMico — adiciona a carta única do Mico
  // -------------------------------------------------------

  /**
   * Injeta a carta única do Mico no array de cartas normais.
   * O Mico tem pairId = 'mico' e não possui par no baralho.
   *
   * @param {Card[]} normalCards - Array de cartas normais (68)
   * @returns {Card[]} Novo array com 69 cartas (normalCards + Mico)
   */
  static injectMico(normalCards) {
    const micoEntry = DeckConfig.MICO_CARD;

    const micoCard = new Card({
      id:        'mico_1',
      pairId:    micoEntry.key,   // 'mico' — par inexistente no baralho
      name:      micoEntry.label,
      faceImage: DeckConfig.faceImagePath(micoEntry.key),
      backImage: DeckConfig.BACK_IMAGE,
      isMico:    true,
    });

    return [...normalCards, micoCard];
  }

  // -------------------------------------------------------
  // Privados
  // -------------------------------------------------------

  /**
   * Atribui orderIndex sequencial a cada carta na ordem atual do array.
   * @param {Card[]} cards
   * @returns {Card[]}
   */
  static #assignOrderIndex(cards) {
    return cards.map((card, index) => card.withOrderIndex(index));
  }
}
