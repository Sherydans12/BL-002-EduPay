/**
 * Utilidades para RUT chileno en el backend.
 * Formato estándar: 12.345.678-9 (puntos + guión, DV en mayúscula)
 */

/** Elimina todo carácter no numérico ni K → "123456789K" */
export function stripRut(rut: string): string {
  return rut.replace(/[^0-9Kk]/g, '').toUpperCase();
}

/**
 * Formatea a puntos y guión: 12345678-9 → 12.345.678-9
 */
export function formatRut(rut: string): string {
  const clean = stripRut(rut);
  if (clean.length < 2) return rut;
  const dv = clean.slice(-1);
  const body = clean.slice(0, -1);
  const withDots = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withDots}-${dv}`;
}

/**
 * Valida el dígito verificador mediante módulo 11.
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
    expected === 11 ? '0' : expected === 10 ? 'K' : expected.toString();
  return dv === expectedDv;
}
