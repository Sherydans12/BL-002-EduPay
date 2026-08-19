/**
 * Token preservation validation utility for student structured names.
 * Ensures that firstName + lastName exactly preserve the original legacy name tokens
 * without additions, omissions, duplications, or altered spellings.
 */

export function normalizeTokenString(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics / accents
    .toLowerCase()
    .trim();
}

export function extractTokens(str: string): string[] {
  if (!str) return [];
  return str
    .split(/\s+/)
    .map((t) => normalizeTokenString(t))
    .filter(Boolean);
}

export interface TokenPreservationValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export function validateNameTokenPreservation(
  legacyName: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): TokenPreservationValidationResult {
  const rawLegacy = (legacyName ?? '').trim();
  const rawFirst = (firstName ?? '').trim();
  const rawLast = (lastName ?? '').trim();

  if (!rawLegacy) {
    return {
      valid: false,
      reason: 'El nombre original no es válido o está vacío.',
    };
  }

  if (!rawFirst) {
    return {
      valid: false,
      reason: 'El campo Nombres no puede estar vacío.',
    };
  }

  if (!rawLast) {
    return {
      valid: false,
      reason: 'El campo Apellidos no puede estar vacío.',
    };
  }

  const legacyTokens = extractTokens(rawLegacy);
  const structuredTokens = extractTokens(`${rawLast} ${rawFirst}`);

  if (legacyTokens.length === 0) {
    return {
      valid: false,
      reason: 'El nombre original no contiene palabras válidas.',
    };
  }

  const sortedLegacy = [...legacyTokens].sort();
  const sortedStructured = [...structuredTokens].sort();

  if (sortedLegacy.length !== sortedStructured.length) {
    return {
      valid: false,
      reason: `El número de palabras no coincide (${sortedStructured.length} ingresadas vs ${sortedLegacy.length} originales). No se permite agregar ni omitir palabras.`,
    };
  }

  for (let i = 0; i < sortedLegacy.length; i++) {
    if (sortedLegacy[i] !== sortedStructured[i]) {
      return {
        valid: false,
        reason: `La palabra "${sortedStructured[i]}" no coincide con las palabras del nombre original. Debe conservar exactamente los términos originales.`,
      };
    }
  }

  return { valid: true };
}
