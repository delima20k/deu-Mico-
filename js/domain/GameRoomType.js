/**
 * @layer domain
 * @group game
 * @role Enum
 * @depends none
 * @exports GameRoomType
 *
 * Enumeração de tipos de salas de jogo suportadas.
 * Define as variantes de quantidade de jogadores e modo torneio.
 */

export class GameRoomType {
  // Tipos de sala por número de jogadores
  static ROOM_2P = '2p';
  static ROOM_3P = '3p';
  static ROOM_4P = '4p';
  static ROOM_5P = '5p';
  static ROOM_6P = '6p';
  static TOURNAMENT = 'tournament';

  /**
   * Valida se um tipo de sala é válido.
   * @param {string} type
   * @returns {boolean}
   */
  static isValid(type) {
    return [
      GameRoomType.ROOM_2P,
      GameRoomType.ROOM_3P,
      GameRoomType.ROOM_4P,
      GameRoomType.ROOM_5P,
      GameRoomType.ROOM_6P,
      GameRoomType.TOURNAMENT
    ].includes(type);
  }

  /**
   * Retorna a quantidade de jogadores associada a um tipo de sala.
   * @param {string} type
   * @returns {number|null}
   */
  static getPlayersCount(type) {
    switch (type) {
      case GameRoomType.ROOM_2P: return 2;
      case GameRoomType.ROOM_3P: return 3;
      case GameRoomType.ROOM_4P: return 4;
      case GameRoomType.ROOM_5P: return 5;
      case GameRoomType.ROOM_6P: return 6;
      case GameRoomType.TOURNAMENT: return null;
      default: return null;
    }
  }

  /**
   * Retorna lista de todos os tipos válidos.
   * @returns {string[]}
   */
  static getAllTypes() {
    return [
      GameRoomType.ROOM_2P,
      GameRoomType.ROOM_3P,
      GameRoomType.ROOM_4P,
      GameRoomType.ROOM_5P,
      GameRoomType.ROOM_6P,
      GameRoomType.TOURNAMENT
    ];
  }
}
