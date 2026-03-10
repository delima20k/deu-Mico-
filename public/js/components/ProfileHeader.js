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
import { Dom } from '../utils/Dom.js';

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

    // Se for URL do Google, faz proxy pelo servidor para evitar CORS
    // Em localhost o proxy não está disponível — usa photoURL diretamente
    let finalSrc = this.#profile.avatarUrl;
    const isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (finalSrc && finalSrc.includes('lh3.googleusercontent.com')) {
      if (isLocalhost) {
        console.log('[Avatar] using direct photoURL (localhost)');
      } else {
        finalSrc = `/api/avatar-proxy?url=${encodeURIComponent(finalSrc)}`;
        console.log('[ProfileHeader] 🔄 Usando proxy para Google avatar:');
        console.log('[ProfileHeader]   Original:', this.#profile.avatarUrl);
        console.log('[ProfileHeader]   Proxy:', finalSrc);
      }
    } else {
      console.log('[ProfileHeader] 📸 Avatar URL:', finalSrc);
    }

    finalSrc = finalSrc || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23ccc%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2248%22 fill=%22%23999%22%3E%3F%3C/text%3E%3C/svg%3E';

    const avatar = Dom.create('img', {
      classes: 'profile-header__avatar',
      attrs: {
        src: finalSrc,
        alt: `Perfil de ${this.#profile.name}`,
        crossOrigin: 'anonymous',
      },
    });

    avatar.addEventListener('error', (e) => {
      console.error('[ProfileHeader] Erro ao carregar imagem do avatar:', e);
      avatar.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23ccc%22/%3E%3C/svg%3E';
    });

    avatarContainer.append(avatar);

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
    if (avatar) {
      avatar.src = dataUrl;
    }
  }

  /**
   * @returns {HTMLElement|null}
   */
  getElement() {
    return this.#el;
  }
}
