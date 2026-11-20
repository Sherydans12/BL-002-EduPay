import { ApiRequestError } from "./api";

/** EduPay Académico, donde se gestionan alumnos, cursos y matrículas. */
export const ACADEMICO_URL =
  process.env.NEXT_PUBLIC_ACADEMICO_URL ||
  "https://academico.edupay.baselogic.cl";

/**
 * `loading` mientras no hay respuesta: las acciones académicas se ocultan
 * hasta saber quién manda. `local` también cuando el BACK todavía no tiene la
 * ruta (404): conserva el comportamiento anterior y el BACK sigue validando.
 */
export type AcademicAuthorityState = "loading" | "academico" | "local";

export function academicAuthorityState(
  result: { managedByAcademico: boolean } | Error,
): AcademicAuthorityState {
  if (result instanceof Error) {
    return result instanceof ApiRequestError && result.status === 404
      ? "local"
      : "academico";
  }
  return result.managedByAcademico ? "academico" : "local";
}

/** Acciones de alta y edición académica visibles solo si Pagos las gestiona. */
export function canManageAcademicRecords(
  state: AcademicAuthorityState,
): boolean {
  return state === "local";
}
