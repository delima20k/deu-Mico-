/**
 * @layer    components
 * @group    menu
 * @role     UI
 * @depends  Dom
 * @exports  ProfileHeader
 *
 * Componente: cabeçalho de perfil no menu lateral.
 * Exibe: avatar circular + nome + idade
 * Sem interatividade (apenas visualização).
 */
import { Dom }       from '../utils/Dom.js';
import { AppConfig } from '../config/AppConfig.js';

export class ProfileHeader {
  /** @type {import('../domain/UserProfile.js').UserProfile} */
  #profile;

  /** @type {HTMLElement} */
  #el;

  /**
   * @param {import('../domain/UserProfile.js').UserProfile} profile
   */
  constructor(profile) {
    this.#profile = profile;
    this.#el      = null;
  }

  /**
   * Cria e retorna o elemento HTML do cabeçalho de perfil.
   * @returns {HTMLElement}
   */
  create() {
    const header = Dom.create('div', { classes: 'profile-header' });

    // Avatar circular
    const avatarContainer = Dom.create('div', {
      classes: 'profile-header__avatar-container',
    });

    const finalSrc = AppConfig.avatarProxyUrl(this.#profile.avatarUrl);
    const fallback = Dom.create('span', {
      classes: 'profile-header__avatar-fallback',
      text: this.#getInitial(),
    });

    if (finalSrc) {
      const avatar = Dom.create('img', {
        classes: 'profile-header__avatar',
        attrs: {
          src: finalSrc,
          alt: `Perfil de ${this.#profile.name || 'Jogador'}`,
        },
      });

      avatar.addEventListener('error', () => {
        avatar.style.display = 'none';
        fallback.style.display = '';
      }, { once: true });

      avatarContainer.append(avatar, fallback);
      fallback.style.display = 'none';
    } else {
      avatarContainer.append(fallback);
    }

    // Nome
    const name = Dom.create('p', {
      classes: 'profile-header__name',
      text: this.#profile.name || 'Jogador',
    });

    // Idade
    const ageText = this.#profile.age 
      ? `${this.#profile.age} anos` 
      : 'Idade não informada';
    const age = Dom.create('p', {
      classes: 'profile-header__age',
      text: ageText,
    });

    header.append(avatarContainer, name, age);
    this.#el = header;
    return header;
  }

  /**
   * Atualiza avatar (usuário selecionou nova imagem).
   * @param {string} dataUrl - data:image/...
   */
  updateAvatar(dataUrl) {
    if (!this.#el) return;
    const avatar = this.#el.querySelector('.profile-header__avatar');
    const fallback = this.#el.querySelector('.profile-header__avatar-fallback');
    if (avatar) {
      avatar.style.display = '';
      avatar.src = dataUrl;
    }
    if (fallback) {
      fallback.textContent = this.#getInitial();
      fallback.style.display = 'none';
    }
  }

  #getInitial() {
    const name = (this.#profile?.name || '').trim();
    return (name[0] || '?').toUpperCase();
  }

  /**
   * @returns {HTMLElement|null}
   */
  getElement() {
    return this.#el;
  }
}
