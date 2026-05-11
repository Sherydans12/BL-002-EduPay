/**
 * Etiqueta es-CL del día civil del pago. Se persiste como 00:00 UTC del YYYY-MM-DD elegido.
 */
export function formatPaymentCalendarDateEsCl(d: Date): string {
  return d.toLocaleDateString('es-CL', { timeZone: 'UTC' });
}
