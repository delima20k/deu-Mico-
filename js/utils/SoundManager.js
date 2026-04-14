/**
 * @layer utils
 * @group audio
 * @role Utility
 * @depends —
 * @exports SoundManager
 *
 * Gerencia carregamento e reprodução de efeitos sonoros.
 * Usa pool de HTMLAudioElement (8 instâncias/som) para permitir
 * sobreposição de sons sem corte (ex.: letter_drop em rápida sequência).
 */
export class SoundManager {
  /** @type {SoundManager|null} */
  static #instance = null;

  /**
   * Cache de buffers: chave = caminho, valor = array de HTMLAudioElement (pool)
   * @type {Map<string, HTMLAudioElement[]>}
   */
  #pool = new Map();

  /** @type {number} Tamanho do pool por som (permite sobreposição) */
  #poolSize = 8;

  /** @type {Map<string, number>} índice atual de cada pool */
  #poolIndex = new Map();

  /** @type {boolean} */
  #muted = false;

  // -------------------------------------------------------
  // Singleton
  // -------------------------------------------------------
  static getInstance() {
    if (!SoundManager.#instance) {
      SoundManager.#instance = new SoundManager();
    }
    return SoundManager.#instance;
  }

  // -------------------------------------------------------
  // Carregamento
  // -------------------------------------------------------

  /**
   * Pré-carrega um som e cria pool de reprodução.
   * @param {string} key
   * @param {string} src
   * @param {number} [volume=1]
   */
  load(key, src, volume = 1) {
    const pool = [];
    for (let i = 0; i < this.#poolSize; i++) {
      const audio = new Audio(src);
      audio.volume = volume;
      audio.preload = 'auto';
      pool.push(audio);
    }
    this.#pool.set(key, pool);
    this.#poolIndex.set(key, 0);
  }

  /**
   * Registra listeners para desbloquear autoplay na primeira interação.
   * Desbloqueia TODAS as instâncias de TODOS os pools (necessário no iOS Safari).
   * @param {HTMLElement} [target=document.body]
   */
  unlockOnInteraction(target = document.body) {
    const unlock = () => {
      this.#pool.forEach(instances => {
        instances.forEach(audio => {
          audio.play().then(() => audio.pause()).catch(() => {});
        });
      });
    };

    const onInteract = () => {
      unlock();
      target.removeEventListener('click',      onInteract);
      target.removeEventListener('touchstart', onInteract);
      target.removeEventListener('keydown',    onInteract);
    };

    target.addEventListener('click',      onInteract, { once: true });
    target.addEventListener('touchstart', onInteract, { once: true });
    target.addEventListener('keydown',    onInteract, { once: true });
  }

  // -------------------------------------------------------
  // Reprodução
  // -------------------------------------------------------

  /**
   * Reproduz um som pelo key. Usa pool para permitir sobreposição.
   * @param {string} key
   */
  play(key) {
    if (this.#muted) return;

    const pool = this.#pool.get(key);
    if (!pool) {
      console.warn(`[SoundManager] Som não carregado: "${key}".`);
      return;
    }

    const index = this.#poolIndex.get(key);
    const audio = pool[index];

    audio.currentTime = 0;
    audio.play().catch(() => {});

    this.#poolIndex.set(key, (index + 1) % this.#poolSize);
  }

  /**
   * Reproduz um som uma única vez e retorna Promise que resolve ao terminar.
   * @param {string} key
   * @returns {Promise<void>}
   */
  playOnce(key) {
    if (this.#muted) return Promise.resolve();

    const pool = this.#pool.get(key);
    if (!pool) {
      console.warn(`[SoundManager] Som não carregado: "${key}".`);
      return Promise.resolve();
    }

    const audio = pool[0];
    audio.currentTime = 0;

    return new Promise(resolve => {
      const onEnd = () => {
        audio.removeEventListener('ended', onEnd);
        resolve();
      };
      audio.addEventListener('ended', onEnd);
      audio.play().catch(() => resolve());
    });
  }

  // -------------------------------------------------------
  // Controle global
  // -------------------------------------------------------
  mute()   { this.#muted = true; }
  unmute() { this.#muted = false; }
  isMuted(){ return this.#muted; }
}