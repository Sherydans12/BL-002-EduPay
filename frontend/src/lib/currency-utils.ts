/**
 * Utilidades para formateo, normalización y parseo de montos en Pesos Chilenos (CLP).
 * Garantiza el uso consistente de separadores de miles con puntos (.) y el envío
 * seguro de enteros puros a la API/Base de datos.
 */

/**
 * Formatea un número como moneda chilena completa: ej. $145.000
 */
export function formatCLP(amount: number | string | null | undefined): string {
  const num = typeof amount === "string" ? parseCLP(amount) : Number(amount ?? 0);
  if (isNaN(num)) return "$0";

  return num.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

/**
 * Formatea un número sólo con separadores de miles con puntos (sin símbolo $): ej. 145.000
 */
export function formatNumberCLP(amount: number | string | null | undefined): string {
  const num = typeof amount === "string" ? parseCLP(amount) : Number(amount ?? 0);
  if (isNaN(num)) return "0";

  return num.toLocaleString("es-CL", {
    maximumFractionDigits: 0,
  });
}

/**
 * Limpia y parsea cualquier texto o número ingresado por el usuario (ej: "$145.000", "145.000", " 145000 ")
 * a un número entero puro seguro para enviar a la base de datos y cálculos matemáticos.
 */
export function parseCLP(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : Math.round(value);

  const clean = value.replace(/[^\d-]/g, "");
  if (!clean || clean === "-") return 0;

  const parsed = parseInt(clean, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Formatea un valor en tiempo real para inputs de texto con separador de miles.
 */
export function formatCurrencyInput(value: string | number): string {
  const parsed = parseCLP(value);
  if (parsed === 0) return "";
  return formatNumberCLP(parsed);
}
