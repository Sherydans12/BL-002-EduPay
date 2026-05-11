/**
 * Muestra la fecha de pago tal como el usuario la eligió (YYYY-MM-DD).
 * En BD/API viene como instante UTC 00:00 de ese día; formatear en UTC evita
 * que en Chile (UTC-3/4) aparezca el día anterior con toLocaleDateString local.
 */
export function formatPaymentDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("es-CL", { timeZone: "UTC" });
}
