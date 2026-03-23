/**
 * @layer    services
 * @group    audio
 * @role     Service
 * @depends  Time
 * @exports  AudioService
 *
 * Serviço de áudio para efeitos sonoros em toda a aplicação.
 * Implementa throttle para evitar sons repetidos muito rapidamente.
 * Singleton: uma instância compartilhada por toda a app.
 */
import { Time } from '../utils/Time.js';

export class AudioService {
  /** @type {AudioService|null} */
  static #instance = null;

  /** @type {Map<string, HTMLAudioElement>} cada som é uma instância */
  #sounds = new Map();

  /** @type {number} throttle em ms (padrão: 120ms entre sons) */
  #throttleMs = 120;

  /** @type {Map<string, number>} último timestamp de reprodução por som */
  #lastPlay = new Map();

  /** @type {boolean} */
  #muted = false;

  static getInstance() {
    if (!AudioService.#instance) {
      AudioService.#instance = new AudioService();
    }
    return AudioService.#instance;
  }

  // -------------------------------------------------------
  // Carregamento
  // -------------------------------------------------------

  /**
   * Carrega um arquivo de áudio.
   * @param {string} key - identificador único do som
   * @param {string} src - path ao arquivo (ex: 'audio/made.mp3')
   * @param {number} [volume=1] - volume 0-1
   */
  load(key, src, volume = 1) {
    const audio = new Audio(src);
    audio.volume = volume;
    audio.preload = 'auto';
    this.#sounds.set(key, audio);
    this.#lastPlay.set(key, 0);
  }

  /**
   * Ajusta a velocidade de reprodução de um som já carregado.
   * @param {string} key
   * @param {number} rate - ex: 1.6 = 60% mais rápido
   */
  setPlaybackRate(key, rate) {
    const audio = this.#sounds.get(key);
    if (audio) audio.playbackRate = rate;
  }

  /**
   * Define o throttle em ms.
   * @param {number} ms
   */
  setThrottle(ms) {
    this.#throttleMs = ms;
  }

  // -------------------------------------------------------
  // Reprodução
  // -------------------------------------------------------

  /**
   * Reproduz um som respeitando throttle.
   * @param {string} key
   * @returns {boolean} true se tocou, false se foi throttled
   */
  play(key) {
    if (this.#muted) return false;

    const audio = this.#sounds.get(key);
    if (!audio) {
      console.warn(`[AudioService] Som não carregado: "${key}".`);
      return false;
    }

    const now = Date.now();
    const last = this.#lastPlay.get(key) || 0;
    const delta = now - last;

    // Throttle: não toca se passou menos de throttleMs desde a última vez
    if (delta < this.#throttleMs) {
      return false;
    }

    this.#lastPlay.set(key, now);
    audio.currentTime = 0;
    audio.play().catch(() => {});

    return true;
  }

  /**
   * Reproduz sem throttle (força).
   * @param {string} key
   */
  playForce(key) {
    if (this.#muted) return;

    const audio = this.#sounds.get(key);
    if (!audio) {
      console.warn(`[AudioService] Som não carregado: "${key}".`);
      return;
    }

    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  // -------------------------------------------------------
  // Controle global
  // -------------------------------------------------------

  mute()    { this.#muted = true; }
  unmute()  { this.#muted = false; }
  isMuted() { return this.#muted; }

  // -------------------------------------------------------
  // Música de fundo (BGM) — loop automático
  // -------------------------------------------------------

  /**
   * Inicia a reprodução em loop de um som já carregado.
   * Se já estiver tocando o mesmo som, não reinicia.
   * @param {string} key
   */
  playLoop(key) {
    if (this.#muted) return;
    const audio = this.#sounds.get(key);
    if (!audio) {
      console.warn(`[AudioService] Som não carregado: "${key}".`);
      return;
    }
    // Evita reiniciar se já está tocando o mesmo BGM
    if (!audio.paused) return;
    audio.loop = true;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  /**
   * Para a reprodução de um som em loop e reseta a posição.
   * @param {string} key
   */
  stopLoop(key) {
    const audio = this.#sounds.get(key);
    if (!audio) return;
    audio.loop = false;
    audio.pause();
    audio.currentTime = 0;
  }

  /**
   * Limpa todos os sons carregados.
   */
  clear() {
    this.#sounds.clear();
    this.#lastPlay.clear();
  }
}
