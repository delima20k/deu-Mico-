/**
 * @layer    utils
 * @group    validation
 * @role     Utility
 * @depends  —
 * @exports  Validator
 *
 * Utilitária estática para validações comuns.
 * Email, password, age, name, etc.
 * Retorna {valid: boolean, error?: string}
 */
export class Validator {
  /**
   * Valida formato básico de e-mail.
   * @param {string} email
   * @returns {{ valid: boolean, error?: string }}
   */
  static email(email) {
    const trimmed = email?.trim() || '';
    if (!trimmed) return { valid: false, error: 'E-mail é obrigatório.' };
    if (!trimmed.includes('@') || trimmed.length < 5) {
      return { valid: false, error: 'E-mail inválido.' };
    }
    return { valid: true };
  }

  /**
   * Valida senha mínima.
   * @param {string} password
   * @param {number} [minLength=6]
   * @returns {{ valid: boolean, error?: string }}
   */
  static password(password, minLength = 6) {
    if (!password) return { valid: false, error: 'Senha é obrigatória.' };
    if (password.length < minLength) {
      return { valid: false, error: `Senha deve ter pelo menos ${minLength} caracteres.` };
    }
    return { valid: true };
  }

  /**
   * Valida idade (6 a 120).
   * @param {number|string} age
   * @returns {{ valid: boolean, error?: string }}
   */
  static age(age) {
    const num = Number(age);
    if (isNaN(num)) return { valid: false, error: 'Idade deve ser um número.' };
    if (num < 6 || num > 120) {
      return { valid: false, error: 'Idade deve estar entre 6 e 120 anos.' };
    }
    return { valid: true };
  }

  /**
   * Valida nome do usuário.
   * @param {string} name
   * @param {number} [minLength=2]
   * @returns {{ valid: boolean, error?: string }}
   */
  static name(name, minLength = 2) {
    const trimmed = name?.trim() || '';
    if (!trimmed) return { valid: false, error: 'Nome é obrigatório.' };
    if (trimmed.length < minLength) {
      return { valid: false, error: `Nome deve ter pelo menos ${minLength} caracteres.` };
    }
    return { valid: true };
  }

  /**
   * Valida coincidência entre dois valores (ex: senha e confirmar senha).
   * @param {string} val1
   * @param {string} val2
   * @param {string} [fieldName='valores']
   * @returns {{ valid: boolean, error?: string }}
   */
  static match(val1, val2, fieldName = 'valores') {
    if (val1 !== val2) {
      return { valid: false, error: `Os ${fieldName} não coincidem.` };
    }
    return { valid: true };
  }

  /**
   * Combina múltiplas validações.
   * @param {Array<{valid: boolean, error?: string}>} results
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static combine(...results) {
    const errors = results.filter(r => !r.valid).map(r => r.error).filter(Boolean);
    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
