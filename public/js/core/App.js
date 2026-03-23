/**
 * @layer core
 * @group bootstrap
 * @role Core
 * @depends ScreenManager, Router, SplashIceScreen, SplashGreenScreen, HomeScreen, LoginScreen, RegisterScreen, MenuScreen, RoomsScreen, MatchRoomScreen, GameTableScreen, TournamentScreen, SoundManager, AudioService, FirebaseService, NavigationService
 * @exports App
 *
 * Ponto de entrada ÚNICO da aplicação.
 *
 * Responsabilidades:
 *  - Instanciar e conectar todos os subsistemas.
 *  - Registrar telas no ScreenManager.
 *  - Definir rotas no Router.
 *  - Iniciar serviços externos (Firebase, Som).
 *  - Lançar a primeira tela.
 *
 * IMPORTANTE: App.bootstrap() é a única linha de código fora de classe
 * neste módulo — equivalente ao ponto de entrada main() de outros runtimes.
 * O <script type="module"> do HTML já é adiado pelo browser (deferred),
 * portanto não é necessário document.addEventListener('DOMContentLoaded').
 */
import { ScreenManager }      from './ScreenManager.js';
import { Router }             from './Router.js';
import { SplashIceScreen }    from '../screens/SplashIceScreen.js';
import { SplashGreenScreen }  from '../screens/SplashGreenScreen.js';
import { HomeScreen }         from '../screens/HomeScreen.js';
import { LoginScreen }        from '../screens/LoginScreen.js';
import { RegisterScreen }     from '../screens/RegisterScreen.js';
import { MenuScreen }         from '../screens/MenuScreen.js';
import { RoomsScreen }        from '../screens/RoomsScreen.js';
import { MatchRoomScreen }    from '../screens/MatchRoomScreen.js';
import { GameTableScreen }    from '../screens/GameTableScreen.js';
import { TournamentScreen }   from '../screens/TournamentScreen.js';
import { SoundManager }       from '../utils/SoundManager.js';
import { AudioService }       from '../services/AudioService.js';
import { FirebaseService }    from '../services/FirebaseService.js';
import { NavigationService }  from '../services/NavigationService.js';
import { bindButtonSounds }   from '../utils/ButtonSoundBinder.js';

export class App {
  /** @type {ScreenManager} */
  #screenManager;

  /** @type {Router} */
  #router;

  /** @type {boolean} */
  static #intentionalLogout = false;

  // -------------------------------------------------------
  // Bootstrap — ponto de entrada público
  // -------------------------------------------------------

  /**
   * Marca um logout como intencional (via botão do menu).
   * Permite que a página seja recarregada/fechada sem confirmação.
   * @static
   */
  static markIntentionalLogout() {
    App.#intentionalLogout = true;
  }

  /**
   * Cria e inicializa a aplicação.
   * Único ponto de entrada externo a esta classe.
   */
  static bootstrap() {
    new App().#init().catch(err => {
      console.error('[App] Erro fatal na inicialização:', err);
    });
  }

  // -------------------------------------------------------
  // Inicialização privada
  // -------------------------------------------------------

  async #init() {
    const root = document.getElementById('app');
    if (!root) throw new Error('[App] Elemento #app não encontrado no DOM.');

    // ── Proteção contra logout não intencional (DESABILITADO PARA DESENVOLVIMENTO) ──
    // window.addEventListener('beforeunload', (e) => {
    //   if (!App.#intentionalLogout) {
    //     e.preventDefault();
    //     e.returnValue = 'Tem certeza que deseja sair? Você será desconectado!';
    //     return 'Tem certeza que deseja sair? Você será desconectado!';
    //   }
    // });

    // 1. Núcleo de navegação
    this.#screenManager = new ScreenManager(root);

    // 1.5. Inicializa NavigationService (centraliza navegação entre telas)
    NavigationService.initialize(this.#screenManager);

    // 2. Telas registradas
    this.#screenManager.registerAll([
      new SplashIceScreen(this.#screenManager),
      new SplashGreenScreen(this.#screenManager),
      new HomeScreen(this.#screenManager),
      new LoginScreen(this.#screenManager),
      new RegisterScreen(this.#screenManager),
      new MenuScreen(this.#screenManager),
      new RoomsScreen(this.#screenManager),
      new MatchRoomScreen(this.#screenManager),
      new GameTableScreen(this.#screenManager),
      new TournamentScreen(this.#screenManager),
    ]);

    // 3. Rotas de hash
    this.#router = new Router(this.#screenManager);
    this.#router
      .addRoute('#home',       'HomeScreen')
      .addRoute('#login',      'LoginScreen')
      .addRoute('#register',   'RegisterScreen')
      .addRoute('#menu',       'MenuScreen')
      .addRoute('#rooms',      'RoomsScreen')
      .addRoute('#match',      'MatchRoomScreen')
      .addRoute('#game-table', 'GameTableScreen')
      .addRoute('#tournament', 'TournamentScreen');
    this.#router.start();

    // 4. Serviço de áudio — desbloqueia autoplay na primeira interação
    SoundManager.getInstance().unlockOnInteraction();

    // 4.5. Carrega sons para menus e botões
    AudioService.getInstance().load('menu_click',  'audio/made.mp3', 0.8);          // legado (MenuButton)
    AudioService.getInstance().load('btn-tap',     'audio/made.mp3', 0.8);          // clique genérico
    AudioService.getInstance().load('btn-confirm', 'audio/confirm_action.mp3', 0.9); // confirmação de ação
    // Ativa sons globais em todos os botões via event delegation
    bindButtonSounds();
    // Sons de par: material-gold = qualquer par | pair-own = par do próprio usuário
    AudioService.getInstance().load('pair-gold', 'audio/freesound_crunchpixstudio-material-gold-394476.mp3', 0.9);
    AudioService.getInstance().load('pair-own',  'audio/freesound_crunchpixstudio-clear-combo-7-394494.mp3',  1.0);
    // Sons da carta do mico
    AudioService.getInstance().load('mico-click',  'audio/universfield-game-character-140506.mp3', 1.0);
    AudioService.getInstance().load('mico-arrive', 'audio/freesound_community-negative_beeps-6008.mp3', 0.9);
    // Música de fundo do menu
    AudioService.getInstance().load('menu-bgm',    'audio/jls-creation-maringa-conga-246609.mp3', 0.75);
    // Som de entrada na mesa de jogo
    AudioService.getInstance().load('table-open',    'audio/freesound_community-tarot-shuffle-89105.mp3', 1.0);
    // Sons de embaralhamento e entrega de cartas
    AudioService.getInstance().load('shuffle-start', 'audio/enbaralhamento.mp3',  1.0);
    AudioService.getInstance().load('deal-start',    'audio/entragar-cartas.mp3', 1.0);
    AudioService.getInstance().setPlaybackRate('deal-start', 1.6);
    AudioService.getInstance().load('card-fly-land', 'audio/entragar-cartas.mp3', 0.9);
    // Sons de fim de jogo
    AudioService.getInstance().load('game-over',     'audio/game-over.mp3',      1.0);
    AudioService.getInstance().load('vitoria-comum', 'audio/vitoria-comun.mp3',  1.0);
    AudioService.getInstance().load('fala-vitaria',  'audio/fala-vitaria.mp3',   1.0);
    AudioService.getInstance().load('tournament-opponent-entry', 'audio/entrada-de-oponente.mp3', 0.95);
    SoundManager.getInstance().load('made', 'audio/made.mp3', 0.8);

    // 5. Firebase — não bloqueia; funciona mesmo sem config
    FirebaseService.getInstance().init().catch(err => {
      console.warn('[App] Firebase init falhou silenciosamente:', err.message);
    });

    // 5.5. Reconexão Firebase após background (PWA Android / rede instável)
    // Quando o PWA fica em segundo plano no Android, o SO pode suspender o
    // WebSocket do Firebase. Ao voltar ao foreground, forçamos goOnline().
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const fs    = FirebaseService.getInstance();
        const db    = fs.getDatabase();
        const dbMod = fs.getDbModules();
        if (db && dbMod?.goOnline) {
          console.log('[Firebase] 🔄 App voltou ao foreground — forçando reconexão');
          dbMod.goOnline(db);
          // Verifica imediatamente o status da conexão
          const connRef = dbMod.ref(db, '.info/connected');
          dbMod.onValue(connRef, (snap) => {
            console.log('[Firebase] Conexão:', snap.val() ? '✅ online' : '❌ offline');
          }, { onlyOnce: true });
        }
      }
    });

    window.addEventListener('online', () => {
      console.log('[Firebase] 🌐 Network online detectado — forçando reconexão');
      const fs    = FirebaseService.getInstance();
      const db    = fs.getDatabase();
      const dbMod = fs.getDbModules();
      if (db && dbMod?.goOnline) dbMod.goOnline(db);
    });

    // Recebe mensagem do Service Worker solicitando reconexão Firebase
    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data?.type === 'RECONNECT_FIREBASE') {
        console.log('[Firebase] 📨 SW solicitou reconexão — chamando goOnline');
        const fs    = FirebaseService.getInstance();
        const db    = fs.getDatabase();
        const dbMod = fs.getDbModules();
        if (db && dbMod?.goOnline) dbMod.goOnline(db);
      }
    });

    // 6. Lança a primeira tela
    await this.#start();
  }

  async #start() {
    // Limpa hashes que possam rotear diretamente ao jogo sem partida ativa.
    // Isso evita que um hash #game-table ou #match fique preso na URL após
    // um refresh/fechamento e cause navegação indevida via Router.
    const staleHashes = ['#game-table', '#match'];
    if (staleHashes.includes(window.location.hash)) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    await this.#screenManager.show('SplashIceScreen');
  }
}

// Único código fora da classe neste módulo: dispara o bootstrap.
App.bootstrap();
