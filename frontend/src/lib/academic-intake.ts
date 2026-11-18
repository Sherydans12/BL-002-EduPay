import { ApiRequestError, type AcademicIntakeItem } from "./api";

const YEAR_STATUS_LABELS: Record<string, string> = {
  DRAFT: "en preparación",
  ACTIVE: "en curso",
  CLOSED: "cerrado",
  ARCHIVED: "archivado",
};

/** "2027 · en preparación". */
export function intakeYearLabel(item: AcademicIntakeItem): string {
  const status = YEAR_STATUS_LABELS[item.academicYearStatus];
  return status
    ? `${item.academicYearLabel} · ${status}`
    : item.academicYearLabel;
}

/** "RUN 11.111.111-1", "IPE A123" o "Sin RUN ni IPE". */
export function intakeNationalIdLabel(item: AcademicIntakeItem): string {
  if (!item.nationalId || !item.nationalIdType) return "Sin RUN ni IPE";
  return `${item.nationalIdType} ${item.nationalId}`;
}

/** Sin RUN ni IPE no se puede crear la ficha: se corrige en Académico. */
export function intakeCanCreate(item: AcademicIntakeItem): boolean {
  return Boolean(item.nationalId && item.nationalIdType);
}

/** Mensaje para el estado de error de la lista. */
export function intakeLoadErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 403) {
    return "Tu rol no permite ver los alumnos por incorporar.";
  }
  if (error instanceof ApiRequestError && error.status === 404) {
    return "Pagos aún no tiene habilitada la llegada de alumnos desde Académico.";
  }
  return error instanceof Error
    ? error.message
    : "No se pudo cargar la lista de alumnos por incorporar.";
}
