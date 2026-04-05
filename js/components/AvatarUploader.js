/**
 * @layer    components
 * @group    menu
 * @role     UI
 * @depends  Dom, AvatarService, UserRepository
 * @exports  AvatarUploader
 *
 * Componente: seletor e upload de avatar.
 * - File input para selecionar imagem
 * - Preview imediato (Data URL local)
 * - Upload real para Firebase Storage via AvatarService
 * - Salva downloadURL em /users/{uid}/profile/avatarUrl via UserRepository
 * - localStorage: apenas cache de preview offline, NÃO é fonte principal
 */
import { Dom }            from '../utils/Dom.js';
import { AvatarService }  from '../services/AvatarService.js';
import { UserRepository } from '../repositories/UserRepository.js';

export class AvatarUploader {
  /** @type {string} */
  #uid;

  /**
   * Chamado com URL de preview (Data URL) e depois com a downloadURL permanente.
   * @type {(url: string) => void}
   */
  #onUpload;

  /** @type {HTMLElement|null} */
  #el = null;

  /** @type {HTMLButtonElement|null} */
  #btn = null;

  /**
   * @param {Object} options
   * @param {string} options.uid        - UID do usuário autenticado
   * @param {(url: string) => void} [options.onUpload] - callback com URL final
   */
  constructor({ uid, onUpload = null }) {
    this.#uid      = uid;
    this.#onUpload = onUpload;
  }

  /**
   * Cria e retorna o elemento HTML do uploader.
   * @returns {HTMLElement}
   */
  create() {
    const container = Dom.create('div', { classes: 'avatar-uploader' });

    // Input file (hidden)
    const input = Dom.create('input', {
      attrs: { type: 'file', accept: 'image/*' },
    });
    input.style.display = 'none';

    // Botão visível
    this.#btn = Dom.create('button', {
      classes: 'avatar-uploader__button',
      text: 'Alterar Avatar',
      attrs: { type: 'button' },
    });

    this.#btn.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => this.#handleFileSelect(e));

    container.append(input, this.#btn);
    this.#el = container;
    return container;
  }

  /**
   * Processa arquivo selecionado:
   * 1. Validações rápidas
   * 2. Preview imediato via FileReader (Data URL)
   * 3. Upload para Firebase Storage via AvatarService
   * 4. Persiste downloadURL no RTDB via UserRepository
   * @private
   */
  async #handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validações rápidas (AvatarService valida de novo, mas falha antes)
    if (!file.type.startsWith('image/')) {
      console.warn('[AvatarUploader] Arquivo não é imagem');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      console.warn('[AvatarUploader] Imagem muito grande (máx 5 MB)');
      return;
    }

    // Preview imediato — não bloqueia o upload
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      // Cache local apenas para preview enquanto o upload ocorre
      try { localStorage.setItem(`user_avatar_${this.#uid}`, dataUrl); } catch (_) {}
      // Notifica UI com preview rápido
      this.#onUpload?.(dataUrl);
    };
    reader.readAsDataURL(file);

    // Upload real — desabilita botão durante o envio
    if (this.#btn) {
      this.#btn.textContent = 'Enviando...';
      this.#btn.disabled    = true;
    }

    try {
      const url = await AvatarService.getInstance().uploadAvatar(this.#uid, file);
      await UserRepository.getInstance().updateAvatarUrl(this.#uid, url);

      // Atualiza cache local com URL definitiva
      try { localStorage.setItem(`user_avatar_${this.#uid}`, url); } catch (_) {}

      // Notifica UI com URL permanente (substitui o preview)
      this.#onUpload?.(url);
    } catch (err) {
      console.error('[AvatarUploader] Erro no upload:', err);
    } finally {
      if (this.#btn) {
        this.#btn.textContent = 'Alterar Avatar';
        this.#btn.disabled    = false;
      }
    }
  }

  /**
   * Retorna URL em cache local (preview offline).
   * ATENÇÃO: prefira sempre profile.avatarUrl carregado do RTDB.
   * @static
   * @param {string} uid
   * @returns {string|null}
   */
  static loadFromLocalStorage(uid) {
    try { return localStorage.getItem(`user_avatar_${uid}`) || null; }
    catch (_) { return null; }
  }

  /** @returns {HTMLElement|null} */
  getElement() { return this.#el; }
}
