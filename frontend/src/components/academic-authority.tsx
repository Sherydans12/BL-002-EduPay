"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Info } from "lucide-react";

import { academicAuthorityApi } from "@/lib/api";
import {
  ACADEMICO_URL,
  academicAuthorityState,
  type AcademicAuthorityState,
} from "@/lib/academic-authority";

/** Quién gestiona alumnos, cursos y matrículas del tenant (ADR-0028). */
export function useAcademicAuthority(): AcademicAuthorityState {
  const [state, setState] = useState<AcademicAuthorityState>("loading");
  useEffect(() => {
    let active = true;
    academicAuthorityApi
      .status()
      .then((result) => active && setState(academicAuthorityState(result)))
      .catch(
        (error: Error) => active && setState(academicAuthorityState(error)),
      );
    return () => {
      active = false;
    };
  }, []);
  return state;
}

export function AcademicAuthorityNotice({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <div
      role="note"
      className="flex flex-wrap items-start gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-sky-300" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold text-white">
          Alumnos, cursos y matrículas se gestionan en EduPay Académico
        </p>
        <p className="text-sky-100/90">
          {children ??
            "Aquí se gestionan apoderados, plan de cobro, cuotas y pagos. Los alumnos nuevos llegan solos a “Nuevos desde Académico”."}
        </p>
      </div>
      <a
        href={ACADEMICO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-400/40 px-4 text-xs font-semibold text-white hover:bg-sky-500/20"
      >
        Abrir Académico
        <ExternalLink className="size-3.5" aria-hidden />
        <span className="sr-only">(se abre en otra pestaña)</span>
      </a>
    </div>
  );
}
