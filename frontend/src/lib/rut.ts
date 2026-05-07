/**
 * Utilidades para RUT chileno: formato, validación módulo-11, normalización.
 * Formato estándar del sistema: 12.345.678-9  (puntos + guión, DV en mayúscula)
 */

/** Elimina todo carácter no numérico ni K/k → "123456789K" */
export function stripRut(rut: string): string {
  return rut.replace(/[^0-9Kk]/g, "").toUpperCase();
}

/**
 * Formatea un RUT a puntos y guión: 12345678-9 → 12.345.678-9
 * Acepta cualquier formato de entrada (con o sin puntos/guión).
 * Retorna la cadena original si no tiene suficientes dígitos.
 */
export function formatRut(rut: string): string {
  const clean = stripRut(rut);
  if (clean.length < 2) return rut;
  const dv = clean.slice(-1);
  const body = clean.slice(0, -1);
  // Agregar puntos de miles al cuerpo
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withDots}-${dv}`;
}

/**
 * Valida el dígito verificador mediante módulo 11.
 * Acepta cualquier formato (con/sin puntos ni guión).
 */
export function isValidRut(rut: string): boolean {
  const clean = stripRut(rut);
  if (clean.length < 8 || clean.length > 9) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;

  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const expected = 11 - (sum % 11);
  const expectedDv =
    expected === 11 ? "0" : expected === 10 ? "K" : expected.toString();
  return dv === expectedDv;
}

/**
 * Normaliza el RUT mientras el usuario escribe:
 * - Permite solo dígitos, puntos, guión y K/k
 * - Cuando el usuario termina de escribir (onBlur / al enviar), usar formatRut()
 */
export function sanitizeRutInput(value: string): string {
  return value.replace(/[^0-9.\-kK]/g, "").toUpperCase();
}
