/**
 * @layer  services
 * @group  firebase
 * @role   config
 * @depends —
 * @exports FirebaseConfig
 *
 * Configuração do projeto Firebase — projeto: deu-mico-pwa.
 *
 * Responsabilidade ÚNICA: guardar e expor o objeto de configuração.
 * Não contém initializeApp nem qualquer lógica de runtime.
 * Quem inicializa o Firebase é exclusivamente FirebaseService.init().
 *
 * ATENÇÃO: não comite este arquivo com dados reais em
 * repositórios públicos (adicione ao .gitignore se necessário).
 */
export class FirebaseConfig {

  /**
   * Objeto de configuração do projeto Firebase.
   * Todos os campos são obrigatórios para Email/Senha e Google Auth.
   * @type {{ apiKey: string, authDomain: string, projectId: string, storageBucket: string, messagingSenderId: string, appId: string }}
   */
  static #config = {
    apiKey:            'AIzaSyDwWmb4j8Qt_Inxf-fCGGxw1bBLvkYNMzg',
    authDomain:        'deu-mico-pwa.firebaseapp.com',
    projectId:         'deu-mico-pwa',
    storageBucket:     'deu-mico-pwa.firebasestorage.app',
    messagingSenderId: '472057932287',
    appId:             '1:472057932287:web:2aa0b8dec8ef42cabfdfca',
  };

  /**
   * Construtor bloqueado — classe é estritamente utilitária.
   * Não pode ser instanciada.
   */
  constructor() {
    throw new Error('FirebaseConfig não pode ser instanciado — use FirebaseConfig.get().');
  }

  /**
   * Retorna uma cópia imutável do objeto de configuração.
   * O spread evita mutação acidental do objeto interno.
   * @returns {{ apiKey: string, authDomain: string, projectId: string, storageBucket: string, messagingSenderId: string, appId: string }}
   */
  static get() {
    return { ...FirebaseConfig.#config };
  }

  /**
   * Retorna true se todas as chaves obrigatórias estão preenchidas.
   * Útil para o FirebaseService validar antes de inicializar.
   * @returns {boolean}
   */
  static isConfigured() {
    const c = FirebaseConfig.#config;
    return Boolean(c.apiKey && c.authDomain && c.projectId && c.appId);
  }
}
