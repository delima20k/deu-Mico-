/**
 * @layer domain
 * @group game
 * @role Domain
 * @depends —
 * @exports GameConfig
 *
 * Configurações e constantes do domínio do jogo Deu Mico.
 * Classe de domínio puro: sem acesso a DOM, sem chamadas externas.
 * Centraliza todas as regras e constantes do jogo para evitar
 * magic numbers/strings espalhados pelo código.
 */
export class GameConfig {
  // Regras do jogo
  static #MIN_PLAYERS    = 2;
  static #MAX_PLAYERS    = 6;
  static #CARDS_PER_HAND = 7;

  // Identidade
  static #GAME_NAME    = 'Deu Mico';
  static #GAME_VERSION = '1.0.0';

  // Duração das telas de splash (ms)
  static #SPLASH_ICE_DURATION   = 3000;
  static #SPLASH_POST_ANIM_DELAY = 1500;

  // Construtor privado: não permite instanciar (classe utilitária de domínio)
  constructor() {
    throw new Error('GameConfig não pode ser instanciado — use os getters estáticos.');
  }

  // -------------------------------------------------------
  // Getters de regras do jogo
  // -------------------------------------------------------

  static get MIN_PLAYERS()    { return GameConfig.#MIN_PLAYERS; }
  static get MAX_PLAYERS()    { return GameConfig.#MAX_PLAYERS; }
  static get CARDS_PER_HAND() { return GameConfig.#CARDS_PER_HAND; }

  // -------------------------------------------------------
  // Getters de identidade
  // -------------------------------------------------------

  static get GAME_NAME()    { return GameConfig.#GAME_NAME; }
  static get GAME_VERSION() { return GameConfig.#GAME_VERSION; }

  // -------------------------------------------------------
  // Getters de temporização
  // -------------------------------------------------------

  static get SPLASH_ICE_DURATION()    { return GameConfig.#SPLASH_ICE_DURATION; }
  static get SPLASH_POST_ANIM_DELAY() { return GameConfig.#SPLASH_POST_ANIM_DELAY; }
}
