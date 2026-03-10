/**
 * @layer   services
 * @group   profile
 * @role    Service
 * @depends FirebaseService, AuthService
 * @exports AvatarService
 *
 * Serviço de upload de avatar para Firebase Storage.
 * path: avatars/{uid}/avatar_{timestamp}.jpg
 *
 * Regras:
 *  - Somente arquivos image/*
 *  - Limite 5 MB
 *  - Retorna downloadURL após upload bem-sucedido
 *  - NÃO acessa Firebase diretamente — usa FirebaseService
 */
import { FirebaseService } from './FirebaseService.js';
import { AuthService }     from './AuthService.js';

export class AvatarService {
  /** @type {AvatarService|null} */
  static #instance = null;

  /** @type {FirebaseService} */
  #firebaseService;

  /** @type {number} Limite de tamanho em bytes (5 MB) */
  static #MAX_BYTES = 5 * 1024 * 1024;

  // -------------------------------------------------------
  // Singleton
  // -------------------------------------------------------
  static getInstance() {
    if (!AvatarService.#instance) {
      AvatarService.#instance = new AvatarService(FirebaseService.getInstance());
    }
    return AvatarService.#instance;
  }

  /** @param {FirebaseService} firebaseService */
  constructor(firebaseService) {
    this.#firebaseService = firebaseService;
  }

  // -------------------------------------------------------
  // Upload
  // -------------------------------------------------------

  /**
   * Faz upload de um arquivo de imagem para Firebase Storage.
   * @param {string} uid  - UID do usuário autenticado
   * @param {File}   file - arquivo selecionado pelo usuário
   * @returns {Promise<string>} downloadURL pública
   */
  async uploadAvatar(uid, file) {
    if (!uid)  throw new Error('[AvatarService] uid obrigatório');
    if (!file) throw new Error('[AvatarService] file obrigatório');

    // Validação tipo
    if (!file.type.startsWith('image/')) {
      throw new Error('[AvatarService] Arquivo não é imagem');
    }

    // Validação tamanho
    if (file.size > AvatarService.#MAX_BYTES) {
      throw new Error(`[AvatarService] Imagem muito grande (máx 5 MB)`);
    }

    const storage    = this.#firebaseService.getStorage();
    const storageMod = this.#firebaseService.getStorageModules();

    if (!storage || !storageMod) {
      throw new Error('[AvatarService] Firebase Storage não inicializado');
    }

    console.log(`[Avatar] uploading uid=${uid.slice(0, 8)}...`);

    const path      = `avatars/${uid}/avatar_${Date.now()}.jpg`;
    const storageRef = storageMod.ref(storage, path);

    await storageMod.uploadBytes(storageRef, file, {
      contentType: file.type,
    });

    const url = await storageMod.getDownloadURL(storageRef);
    console.log(`[Avatar] uploaded url=${url.slice(0, 60)}...`);

    return url;
  }
}
