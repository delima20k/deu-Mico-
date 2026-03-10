/**
 * @layer    domain
 * @group    deck
 * @role     Config
 * @depends  —
 * @exports  DeckConfig
 *
 * Configuração central do baralho "Deu Mico".
 *
 * ─── DIAGNÓSTICO DE INCONSISTÊNCIA ──────────────────────────────────────────
 *
 *   O usuário declarou "34 imagens base" na especificação,
 *   porém a lista fornecida continha apenas 32 cartas normais + carta_mico.
 *
 *   Após varredura da pasta /public/img/, foram encontradas 2 cartas
 *   ausentes da lista mas com arquivo existente nos assets:
 *
 *     ✅ carta_pato.png      → adicionada automaticamente como carta normal
 *     ⚠️ carta_conponato.png → adicionada automaticamente; nome incomum
 *                              (possível typo — verifique se o asset está correto)
 *
 *   Com as 2 cartas adicionadas: 32 + 2 = 34 cartas normais
 *   Resultado final do baralho:
 *     34 pares  = 68 cartas normais
 *     + 1 mico único
 *     ─────────────────
 *     TOTAL = 69 cartas ✅
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class DeckConfig {
  // Caminho base das imagens (relativo ao HTML)
  static #IMG_BASE  = 'img/';
  static #IMG_EXT   = '.png';
  static #BACK_IMG  = 'img/carta_verso.png';
  static #MICO_KEY  = 'mico';

  static #EXPECTED_PAIRS  = 34;
  static #EXPECTED_TOTAL  = 69; // 68 normais + 1 mico

  // -------------------------------------------------------
  // Lista base de cartas NORMAIS (formam pares)
  // -------------------------------------------------------
  //
  // Cartas confirmadas na lista do usuário: 32
  // Cartas adicionadas via varredura de assets: 2
  // Total de cartas normais: 34
  //
  static #BASE_NORMAL_CARDS = [
    // ── Confirmadas na lista do usuário ──────────────────
    { key: 'jacare',      label: 'Jacaré'       },
    { key: 'leao',        label: 'Leão'         },
    { key: 'golfinho',    label: 'Golfinho'     },
    { key: 'elefante',    label: 'Elefante'     },
    { key: 'tucano',      label: 'Tucano'       },
    { key: 'lobo',        label: 'Lobo'         },
    { key: 'urso',        label: 'Urso'         },
    { key: 'tartaruga',   label: 'Tartaruga'    },
    { key: 'tigre',       label: 'Tigre'        },
    { key: 'tubarao',     label: 'Tubarão'      },
    { key: 'porco',       label: 'Porco'        },
    { key: 'urso_panda',  label: 'Urso Panda'   },
    { key: 'vaca',        label: 'Vaca'         },
    { key: 'ovelha',      label: 'Ovelha'       },
    { key: 'sapo',        label: 'Sapo'         },
    { key: 'galinha',     label: 'Galinha'      },
    { key: 'cachorro',    label: 'Cachorro'     },
    { key: 'girafa',      label: 'Girafa'       },
    { key: 'pinguin',     label: 'Pinguim'      },
    { key: 'esquilo',     label: 'Esquilo'      },
    { key: 'coala',       label: 'Coala'        },
    { key: 'cavalo',      label: 'Cavalo'       },
    { key: 'burro',       label: 'Burro'        },
    { key: 'bode',        label: 'Bode'         },
    { key: 'zebra',       label: 'Zebra'        },
    { key: 'caranguejo',  label: 'Caranguejo'   },
    { key: 'coruja',      label: 'Coruja'       },
    { key: 'coelho',      label: 'Coelho'       },
    { key: 'urso_polar',  label: 'Urso Polar'   },
    { key: 'canguru',     label: 'Canguru'      },
    { key: 'morcego',     label: 'Morcego'      },
    { key: 'polvo',       label: 'Polvo'        },
    // ── Adicionadas por varredura dos assets (não estavam na lista) ──
    { key: 'pato',        label: 'Pato',        addedByAssetScan: true },
    { key: 'conponato',   label: 'Conponato',   addedByAssetScan: true, possibleTypo: true },
  ];

  // Carta especial — existe UMA ÚNICA vez no baralho
  static #MICO_CARD = { key: 'mico', label: 'Mico' };

  // Construtor privado: classe utilitária, não instanciável
  constructor() {
    throw new Error('DeckConfig não pode ser instanciado — use os getters estáticos.');
  }

  // -------------------------------------------------------
  // Getters
  // -------------------------------------------------------

  /** @returns {string} URL da imagem do verso de todas as cartas. */
  static get BACK_IMAGE()       { return DeckConfig.#BACK_IMG; }

  /** @returns {string} Chave identificadora da carta Mico. */
  static get MICO_KEY()         { return DeckConfig.#MICO_KEY; }

  /** @returns {number} Pares esperados no baralho completo. */
  static get EXPECTED_PAIRS()   { return DeckConfig.#EXPECTED_PAIRS; }

  /** @returns {number} Total de cartas esperado no baralho (68 normais + 1 mico). */
  static get EXPECTED_TOTAL()   { return DeckConfig.#EXPECTED_TOTAL; }

  /**
   * Retorna cópia da lista de cartas normais base (sem duplicatas, sem mico).
   * @returns {Array<{key: string, label: string, addedByAssetScan?: boolean, possibleTypo?: boolean}>}
   */
  static get BASE_NORMAL_CARDS() {
    return DeckConfig.#BASE_NORMAL_CARDS.map(c => ({ ...c }));
  }

  /**
   * Retorna os dados da carta especial Mico.
   * @returns {{key: string, label: string}}
   */
  static get MICO_CARD() {
    return { ...DeckConfig.#MICO_CARD };
  }

  /**
   * Monta o caminho completo da imagem de face de uma carta.
   * @param {string} key - Chave da carta (ex: 'jacare')
   * @returns {string} Caminho relativo (ex: 'img/carta_jacare.png')
   */
  static faceImagePath(key) {
    return `${DeckConfig.#IMG_BASE}carta_${key}${DeckConfig.#IMG_EXT}`;
  }

  /**
   * Valida a lista base de cartas normais, detectando inconsistências.
   * Retorna relatório de diagnóstico.
   * @returns {{ valid: boolean, totalNormal: number, warnings: string[], errors: string[] }}
   */
  static validateBaseList() {
    const list     = DeckConfig.#BASE_NORMAL_CARDS;
    const keys     = list.map(c => c.key);
    const warnings = [];
    const errors   = [];

    // Duplicatas na lista base
    const seen = new Set();
    keys.forEach(key => {
      if (seen.has(key)) errors.push(`Chave duplicada na lista base: "${key}"`);
      seen.add(key);
    });

    // Cartas adicionadas por varredura (não estavam na lista original)
    const fromScan = list.filter(c => c.addedByAssetScan);
    if (fromScan.length > 0) {
      warnings.push(
        `${fromScan.length} carta(s) não estavam na lista do usuário mas foram encontradas nos assets: ` +
        fromScan.map(c => c.key).join(', ')
      );
    }

    // Possíveis typos
    const typos = list.filter(c => c.possibleTypo);
    if (typos.length > 0) {
      warnings.push(
        `Possível typo nos assets: ${typos.map(c => `"carta_${c.key}.png"`).join(', ')} — verifique se o nome do arquivo está correto.`
      );
    }

    // Contagem de pares
    if (list.length !== DeckConfig.#EXPECTED_PAIRS) {
      errors.push(
        `Lista base tem ${list.length} cartas normais, esperado ${DeckConfig.#EXPECTED_PAIRS}.`
      );
    }

    const valid = errors.length === 0;

    if (valid && warnings.length === 0) {
      console.log('[DeckConfig] ✅ Lista base validada: 34 cartas normais, sem inconsistências.');
    } else {
      if (warnings.length) warnings.forEach(w => console.warn('[DeckConfig] ⚠️', w));
      if (errors.length)   errors.forEach(e => console.error('[DeckConfig] ❌', e));
    }

    return { valid, totalNormal: list.length, warnings, errors };
  }
}
