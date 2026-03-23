/**
 * @layer    services
 * @group    monetization
 * @role     Config
 * @exports  AdConfig
 *
 * Configuração centralizada de anúncios.
 * Flags habilitam/desabilitam cada formato.
 * Placements mapeiam os pontos estratégicos do app.
 *
 * Regras:
 *   - Nunca mostrar anúncio durante jogada ativa
 *   - Usar anúncios apenas em momentos de pausa
 *   - Rewarded sempre opcional (o jogador escolhe assistir)
 *   - Não bloquear jogador com anúncio
 */

export const AdConfig = Object.freeze({

  // ── Flags globais ────────────────────────────────────────────────
  enableBanners:            true,
  enableInterstitial:       true,
  enableRewarded:           true,
  enableFirstPlayerReward:  true,
  enableRematchReward:      true,

  // ── Placements de banner ─────────────────────────────────────────
  // Chave usada em showBanner(placement) / hideBanner(placement)
  bannerPlacements: {
    menu:     'banner-menu',      // exibido no MenuScreen (tela principal logada)
    home:     'banner-home',      // exibido no HomeScreen (landing)
    waiting:  'banner-waiting',   // exibido no MatchRoomScreen (aguardando jogadores)
    results:  'banner-results',   // exibido no modal de fim de partida
  },

  // ── Cooldown (ms) ────────────────────────────────────────────────
  cooldowns: {
    interstitial: 60_000,   // 60 s entre intersticiais
    rewarded:     30_000,   // 30 s entre rewardeds
    banner:       0,        // banners não têm cooldown
  },

  // ── Triggers de intersticial ─────────────────────────────────────
  // Chave usada em showInterstitial(trigger)
  interstitialTriggers: {
    matchFound:  'interstitial-match-found',   // ao sair do MatchRoomScreen p/ GameTable
    afterMatch:  'interstitial-after-match',    // após fim de partida (game over)
    lobbyWait:   'interstitial-lobby-wait',     // após 15 s no lobby (1x)
  },

  // ── Triggers de rewarded ─────────────────────────────────────────
  // Chave usada em showRewarded(trigger)
  rewardedTriggers: {
    gameOverBonus:    'rewarded-game-over-bonus',     // fim de partida (bônus opcional)
    firstPlayerBonus: 'rewarded-first-player-bonus',  // jogador mais novo (dealer) ganha extra
    waitingReward:    'rewarded-waiting-bonus',       // sala de espera (bônus opcional)
    rematchReward:    'rewarded-rematch-bonus',       // fim de partida (revanche/bônus)
  },

  // ── Tipos de recompensa ──────────────────────────────────────────
  rewardTypes: {
    gameOverBonus:    'game_over_bonus',
    firstPlayerBonus: 'first_player_bonus',
    waitingReward:    'waiting_bonus',
    rematchReward:    'rematch_bonus',
  },
});
