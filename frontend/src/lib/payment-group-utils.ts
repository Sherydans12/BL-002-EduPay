import type { PaymentGroup } from "@/lib/api";

/** Etiqueta de pagador para la fila de transacción. */
export function getGroupPayerLabel(group: PaymentGroup): string {
  const lines = group.payments ?? [];
  if (lines.length === 0) return "—";

  const namedPayers = lines.filter((p) => p.payerName?.trim());
  if (namedPayers.length > 0) {
    const unique = new Set(namedPayers.map((p) => p.payerName!.trim()));
    if (unique.size === 1) return [...unique][0];
    return "Múltiples";
  }

  const guardianIds = new Set(lines.map((p) => p.student.guardianId));
  if (guardianIds.size === 1) {
    return lines[0].student.guardian?.name ?? "Apoderado";
  }

  return "Múltiples";
}

export function getGroupBoletaFileUrl(group: PaymentGroup): string | null | undefined {
  return group.boletaFileUrl ?? undefined;
}

export function getGroupBoletaNumber(group: PaymentGroup): string | null | undefined {
  return group.boletaNumber ?? undefined;
}

/** Boleta en listados planos de Payment (reportes). */
export function getPaymentBoletaNumber(
  p: { boletaNumber?: string | null; paymentGroup?: { boletaNumber?: string | null } | null }
): string | undefined {
  return p.paymentGroup?.boletaNumber ?? p.boletaNumber ?? undefined;
}

export function getPaymentBoletaFileUrl(
  p: { boletaFileUrl?: string | null; paymentGroup?: { boletaFileUrl?: string | null } | null }
): string | undefined {
  return p.paymentGroup?.boletaFileUrl ?? p.boletaFileUrl ?? undefined;
}
