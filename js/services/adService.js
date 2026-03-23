/**
 * @layer    services
 * @group    monetization
 * @role     Service (Singleton)
 * @depends  AdConfig
 * @exports  AdService
 *
 * Serviço de anúncios do Deu Mico.
 *
 * No ambiente web (PWA) opera em modo mock:
 *   - Banners visuais no DOM (slot .ad-slot)
 *   - Interstitial simulado via console.log
 *   - showRewarded() abre modal visual e simula resultado positivo
 *
 * Futuro (TWA / APK com AdMob):
 *   - Substituir os métodos mock pelo SDK real
 *   - A interface pública (showBanner, hideBanner, showInterstitial,
 *     showRewarded, grantReward) permanece idêntica
 *
 * Regras:
 *   - Nunca mostrar anúncio durante jogada ativa
 *   - Rewarded sempre opcional (o jogador decide)
 *   - Não bloquear fluxo do jogo
 *   - Cooldown entre exibições para evitar spam
 */

import { AdConfig } from './adConfig.js';

export class AdService {
  /** @type {AdService|null} */
  static #instance = null;

  /** @type {boolean} true quando rodando dentro de TWA/APK com SDK real */
  #nativeSdkAvailable = false;

  /** @type {Map<string, number>} trigger/placement → timestamp da última exibição */
  #lastShownAt = new Map();

  /** @type {Set<string>} Triggers de interstitial já exibidos (anti-duplicação por sessão) */
  #shownInterstitials = new Set();

  /** @type {Set<string>} Placements de banner ativos no momento */
  #activeBanners = new Set();

  constructor() {
    // TODO [AdMob]: Substituir detecção por bridge real do AdMob via TWA
    this.#nativeSdkAvailable = typeof window !== 'undefined'
      && typeof window.AdMobBridge !== 'undefined';

    console.log(`[AdService] init — nativeSDK=${this.#nativeSdkAvailable}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // Singleton
  // ─────────────────────────────────────────────────────────────────

  static getInstance() {
    if (!AdService.#instance) {
      AdService.#instance = new AdService();
    }
    return AdService.#instance;
  }

  // ─────────────────────────────────────────────────────────────────
  // Cooldown
  // ─────────────────────────────────────────────────────────────────

  /**
   * Verifica se um tipo de anúncio está em cooldown.
   * @param {string} key   - identificador (trigger ou placement)
   * @param {number} cooldownMs - duração do cooldown em ms
   * @returns {boolean} true se AINDA está em cooldown (não deve exibir)
   * @private
   */
  #isInCooldown(key, cooldownMs) {
    if (cooldownMs <= 0) return false;
    const last = this.#lastShownAt.get(key) || 0;
    return (Date.now() - last) < cooldownMs;
  }

  /**
   * Registra que um anúncio foi exibido agora.
   * @param {string} key
   * @private
   */
  #markShown(key) {
    this.#lastShownAt.set(key, Date.now());
  }

  // ─────────────────────────────────────────────────────────────────
  // Banner
  // ─────────────────────────────────────────────────────────────────

  /**
   * Exibe um banner no placement indicado.
   * @param {string} placement - chave de AdConfig.bannerPlacements
   */
  showBanner(placement) {
    if (!AdConfig.enableBanners) return;
    if (this.#activeBanners.has(placement)) return; // já ativo, não duplica

    // TODO [AdMob]: Substituir por chamada real ao AdMob via bridge TWA
    if (this.#nativeSdkAvailable) {
      window.AdMobBridge.showBanner(placement);
      this.#activeBanners.add(placement);
      return;
    }

    // Mock web: preenche o slot DOM correspondente
    this.#activeBanners.add(placement);
    this.#renderBannerMock(placement);
    console.log(`[AdService] showBanner mock — placement="${placement}"`);
  }

  /**
   * Esconde o banner do placement indicado.
   * @param {string} placement - chave de AdConfig.bannerPlacements
   */
  hideBanner(placement) {
    if (!AdConfig.enableBanners) return;
    this.#activeBanners.delete(placement);

    // TODO [AdMob]: Substituir por chamada real ao AdMob via bridge TWA
    if (this.#nativeSdkAvailable) {
      window.AdMobBridge.hideBanner(placement);
      return;
    }

    // Mock web: limpa o slot DOM
    this.#clearBannerMock(placement);
    console.log(`[AdService] hideBanner mock — placement="${placement}"`);
  }

  /**
   * Renderiza banner mock visual no slot DOM correspondente.
   * @param {string} placement
   * @private
   */
  #renderBannerMock(placement) {
    // Busca o elemento pelo id que segue a convenção ad-banner-{suffix}
    const suffix = placement.replace('banner-', '');
    const el = document.getElementById(`ad-banner-${suffix}`);
    if (!el) return;
    el.textContent = '📢 Anúncio — Espaço reservado';
    el.style.display = 'flex';
  }

  /**
   * Limpa banner mock do slot DOM.
   * @param {string} placement
   * @private
   */
  #clearBannerMock(placement) {
    const suffix = placement.replace('banner-', '');
    const el = document.getElementById(`ad-banner-${suffix}`);
    if (!el) return;
    el.textContent = '';
    el.style.display = 'none';
  }

  // ─────────────────────────────────────────────────────────────────
  // Intersticial
  // ─────────────────────────────────────────────────────────────────

  /**
   * Exibe um intersticial no trigger indicado.
   * Respeita cooldown e anti-duplicação por sessão.
   * @param {string} trigger - chave de AdConfig.interstitialTriggers
   * @returns {Promise<boolean>} true se exibiu, false se bloqueado/indisponível
   */
  async showInterstitial(trigger) {
    if (!AdConfig.enableInterstitial) return false;

    // Anti-duplicação: cada trigger só pode ser exibido 1x por sessão
    if (this.#shownInterstitials.has(trigger)) {
      console.log(`[AdService] showInterstitial bloqueado (já exibido) — trigger="${trigger}"`);
      return false;
    }

    // Cooldown global entre intersticiais
    if (this.#isInCooldown('__interstitial__', AdConfig.cooldowns.interstitial)) {
      console.log(`[AdService] showInterstitial bloqueado (cooldown) — trigger="${trigger}"`);
      return false;
    }

    // TODO [AdMob]: Substituir por chamada real ao AdMob via bridge TWA
    if (this.#nativeSdkAvailable) {
      const result = await window.AdMobBridge.showInterstitial(trigger);
      if (result) {
        this.#shownInterstitials.add(trigger);
        this.#markShown('__interstitial__');
      }
      return result;
    }

    // Mock web: apenas log
    this.#shownInterstitials.add(trigger);
    this.#markShown('__interstitial__');
    console.log(`[AdService] showInterstitial mock — trigger="${trigger}"`);
    return true;
  }

  /**
   * Verifica se um interstitial já foi exibido nesta sessão.
   * @param {string} trigger
   * @returns {boolean}
   */
  hasShownInterstitial(trigger) {
    return this.#shownInterstitials.has(trigger);
  }

  // ─────────────────────────────────────────────────────────────────
  // Rewarded
  // ─────────────────────────────────────────────────────────────────

  /**
   * Exibe um rewarded opcional.
   * @param {string} trigger - chave de AdConfig.rewardedTriggers
   * @returns {Promise<{ rewarded: boolean, type: string }>}
   *   rewarded=true se o usuário assistiu até o fim
   */
  async showRewarded(trigger) {
    if (!AdConfig.enableRewarded) {
      return { rewarded: false, type: trigger };
    }

    // Cooldown entre rewardeds
    if (this.#isInCooldown('__rewarded__', AdConfig.cooldowns.rewarded)) {
      console.log(`[AdService] showRewarded bloqueado (cooldown) — trigger="${trigger}"`);
      return { rewarded: false, type: trigger };
    }

    // TODO [AdMob]: Substituir por chamada real ao AdMob via bridge TWA
    if (this.#nativeSdkAvailable) {
      const result = await window.AdMobBridge.showRewarded(trigger);
      if (result?.rewarded) this.#markShown('__rewarded__');
      return result;
    }

    // Mock web: abre modal visual simulado
    console.log(`[AdService] showRewarded mock — trigger="${trigger}" (abrindo modal)`);
    const userWatched = await this.#showRewardedModal();

    if (userWatched) {
      this.#markShown('__rewarded__');
      console.log(`[AdService] showRewarded mock — trigger="${trigger}" → rewarded=true`);
    }

    return { rewarded: userWatched, type: trigger };
  }

  /**
   * Exibe modal visual simulado de rewarded (mock web).
   * O jogador pode "assistir" (timer de 3 s) ou fechar sem recompensa.
   * @returns {Promise<boolean>} true se assistiu até o fim
   * @private
   */
  #showRewardedModal() {
    return new Promise((resolve) => {
      // Remove modal anterior se existir (segurança anti-duplicação DOM)
      document.getElementById('ad-rewarded-modal')?.remove();

      const overlay = document.createElement('div');
      overlay.id = 'ad-rewarded-modal';
      overlay.className = 'ad-rewarded-overlay';

      const panel = document.createElement('div');
      panel.className = 'ad-rewarded-panel';

      const title = document.createElement('h3');
      title.className = 'ad-rewarded-panel__title';
      title.textContent = '🎬 Anúncio Recompensado';

      const desc = document.createElement('p');
      desc.className = 'ad-rewarded-panel__desc';
      desc.textContent = 'Assista ao anúncio para ganhar seu bônus!';

      const timer = document.createElement('div');
      timer.className = 'ad-rewarded-panel__timer';
      let secs = 3;
      timer.textContent = `Aguarde ${secs}s…`;

      const btnClose = document.createElement('button');
      btnClose.className = 'ad-rewarded-panel__btn ad-rewarded-panel__btn--close';
      btnClose.textContent = '✕ Fechar sem bônus';
      btnClose.type = 'button';

      const btnClaim = document.createElement('button');
      btnClaim.className = 'ad-rewarded-panel__btn ad-rewarded-panel__btn--claim';
      btnClaim.textContent = '🎁 Resgatar bônus';
      btnClaim.type = 'button';
      btnClaim.style.display = 'none';

      panel.append(title, desc, timer, btnClaim, btnClose);
      overlay.append(panel);
      document.body.append(overlay);

      let resolved = false;
      const cleanup = () => {
        if (overlay.isConnected) overlay.remove();
      };

      // Contagem regressiva
      const interval = setInterval(() => {
        secs--;
        if (secs > 0) {
          timer.textContent = `Aguarde ${secs}s…`;
        } else {
          clearInterval(interval);
          timer.textContent = '✅ Pronto! Resgate seu bônus.';
          btnClaim.style.display = '';
        }
      }, 1000);

      btnClose.addEventListener('click', () => {
        if (resolved) return;
        resolved = true;
        clearInterval(interval);
        cleanup();
        resolve(false);
      });

      btnClaim.addEventListener('click', () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(true);
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Recompensa
  // ─────────────────────────────────────────────────────────────────

  /**
   * Concede recompensa ao jogador.
   * Futuramente pode persistir no Firebase.
   * @param {string} rewardType - chave de AdConfig.rewardTypes
   *
   * TODO [AdMob]: Integrar com backend para validar recompensa server-side
   */
  grantReward(rewardType) {
    console.log(`[AdService] grantReward — type="${rewardType}"`);

    switch (rewardType) {
      case AdConfig.rewardTypes.firstPlayerBonus:
        console.log('[AdService] 🏃 Início acelerado concedido');
        // TODO: integrar com sistema de moedas/XP quando implementado
        break;
      case AdConfig.rewardTypes.waitingReward:
        console.log('[AdService] ⏳ Bônus de espera concedido');
        // TODO: integrar com sistema de moedas/XP quando implementado
        break;
      case AdConfig.rewardTypes.rematchReward:
        console.log('[AdService] 🔁 Bônus de revanche concedido');
        // TODO: integrar com sistema de moedas/XP quando implementado
        break;
      case AdConfig.rewardTypes.gameOverBonus:
        console.log('[AdService] 🎁 Bônus de fim de partida concedido');
        // TODO: integrar com sistema de moedas/XP quando implementado
        break;
      default:
        console.warn(`[AdService] grantReward tipo desconhecido: "${rewardType}"`);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Utilitário
  // ─────────────────────────────────────────────────────────────────

  /**
   * Reseta flags de sessão (ex.: ao fazer logout ou trocar de conta).
   */
  resetSession() {
    this.#shownInterstitials.clear();
    this.#lastShownAt.clear();
    this.#activeBanners.clear();
    console.log('[AdService] sessão resetada');
  }
}
