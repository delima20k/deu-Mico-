/**
 * @layer    utils
 * @group    deck
 * @role     Example / Test
 * @depends  deck (barrel)
 * @exports  runDeckExample
 *
 * Exemplo completo de uso do módulo de baralho.
 * Execute este arquivo isolado para verificar o funcionamento:
 *
 *   import { runDeckExample } from '../utils/deckExample.js';
 *   runDeckExample();
 *
 * Ou ative no App.js em modo de desenvolvimento:
 *   if (DEV_MODE) import('../utils/deckExample.js').then(m => m.runDeckExample());
 */
import {
  buildAndShuffleDeck,
  buildDeck,
  shuffleDeck,
  cutDeck,
  validateDeck,
  DeckConfig,
} from '../services/deck.js';

/**
 * Executa o exemplo demonstrando toda a API do baralho.
 * Todos os resultados são impressos no console do navegador.
 */
export function runDeckExample() {
  console.group('════════════════════════════════════════');
  console.group('🃏  DEU MICO — Exemplo do Módulo Deck');
  console.group('════════════════════════════════════════');

  // ── 1. Construção simples (sem embaralhar) ────────────
  console.group('1️⃣  buildDeck() — baralho em ordem original');
  const rawDeck = buildDeck();
  console.log(`Total de cartas: ${rawDeck.length}`);
  console.log('Primeiras 4 cartas:', rawDeck.slice(0, 4).map(c => ({
    id: c.id, name: c.name, pairId: c.pairId, isMico: c.isMico,
  })));
  console.log('Última carta (Mico):', {
    id: rawDeck.at(-1).id,
    isMico: rawDeck.at(-1).isMico,
    faceImage: rawDeck.at(-1).faceImage,
  });
  console.groupEnd();

  // ── 2. Embaralhamento simples (1×) ────────────────────
  console.group('2️⃣  shuffleDeck() — 1 passagem Fisher-Yates');
  const shuffled1 = shuffleDeck(rawDeck);
  console.log(`Embaralhado. Primeiro da fila: "${shuffled1[0].name}" (id: ${shuffled1[0].id})`);
  console.groupEnd();

  // ── 3. Corte ──────────────────────────────────────────
  console.group('3️⃣  cutDeck() — corte aleatório');
  const cut = cutDeck(shuffled1);
  console.log(`Corte aplicado. Novo topo: "${cut[0].name}" (orderIndex: ${cut[0].orderIndex})`);
  console.groupEnd();

  // ── 4. Fluxo completo recomendado ─────────────────────
  console.group('4️⃣  buildAndShuffleDeck() — fluxo recomendado');
  const deck = buildAndShuffleDeck();

  const micoCard     = deck.find(c => c.isMico);
  const normalCards  = deck.filter(c => !c.isMico);
  const pairIds      = new Set(normalCards.map(c => c.pairId));

  console.log('Resumo final:');
  console.table({
    'Total de cartas':    deck.length,
    'Cartas normais':     normalCards.length,
    'Pares distintos':    pairIds.size,
    'Cartas Mico':        micoCard ? 1 : 0,
    'Verso padrão':       DeckConfig.BACK_IMAGE,
    'Mico está em':       `posição ${micoCard?.orderIndex}`,
  });
  console.groupEnd();

  // ── 5. Operações de estado (imutabilidade) ────────────
  console.group('5️⃣  Operações de estado (Card é imutável — retorna nova instância)');
  const card        = deck[0];
  const faceUp      = card.withFaceUp();
  const matched     = card.withMatched();
  const withOwner   = card.withOwner('player_uid_xyz');

  console.log('Original  isFaceUp:', card.isFaceUp,   '| isMatched:', card.isMatched);
  console.log('faceUp    isFaceUp:', faceUp.isFaceUp, '| (nova instância, original intacto)');
  console.log('matched   isMatched:', matched.isMatched);
  console.log('withOwner ownerPlayerId:', withOwner.ownerPlayerId);
  console.groupEnd();

  // ── 6. Serialização / Desserialização ─────────────────
  console.group('6️⃣  toJSON() / fromJSON() — serialização');
  const json = deck[0].toJSON();
  console.log('toJSON():', json);
  console.groupEnd();

  console.groupEnd(); // fluxo completo
  console.groupEnd(); // DEU MICO
  console.groupEnd(); // linhas
}
