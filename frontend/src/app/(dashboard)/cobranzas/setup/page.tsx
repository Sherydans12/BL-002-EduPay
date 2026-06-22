"use client";

import { useEffect, useMemo, useState } from "react";
import { studentsApi } from "@/lib/api";
import type { FinancialSetupStatus, Student } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";

type FilterMode = "PENDING" | "CONFIGURED" | "ALL";

const FILTERS: Array<{ value: FilterMode; label: string }> = [
  { value: "PENDING", label: "Solo Pendientes" },
  { value: "CONFIGURED", label: "Configurados" },
  { value: "ALL", label: "Todos" },
];

const STATUS_LABELS: Record<FinancialSetupStatus, string> = {
  PENDING: "Pendiente",
  CONFIGURED: "Configurado",
};

async function fetchAllStudentsForRadar(): Promise<Student[]> {
  const all: Student[] = [];
  let page = 1;
  const limit = 200;

  for (;;) {
    const res = await studentsApi.getAll({ page, limit });
    all.push(...res.data);
    const lastPage = res.meta.lastPage ?? res.meta.totalPages ?? 1;
    if (page >= lastPage || res.data.length === 0) break;
    page += 1;
    if (page > 500) break;
  }

  return all;
}

function getFinancialSetup(student: Student): FinancialSetupStatus {
  return student.financialSetup ?? "PENDING";
}

export default function FinancialSetupRadarPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("PENDING");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const data = await fetchAllStudentsForRadar();
        if (!cancelled) setStudents(data);
      } catch (err: unknown) {
        if (!cancelled) {
          toast.error(
            err instanceof Error
              ? err.message
              : "Error al cargar radar financiero",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    const total = students.length;
    const configured = students.filter(
      (student) => getFinancialSetup(student) === "CONFIGURED",
    ).length;
    const pending = total - configured;
    const progress = total === 0 ? 0 : Math.round((configured / total) * 100);

    return { total, configured, pending, progress };
  }, [students]);

  const filteredStudents = useMemo(() => {
    if (filter === "ALL") return students;
    return students.filter((student) => getFinancialSetup(student) === filter);
  }, [filter, students]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10 animate-fade-in">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Radar de Configuración Financiera
          </h1>
          <p className="mt-1 text-[var(--color-text-secondary)]">
            Auditoría de alumnos listos para operar en cuentas por cobrar.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text-secondary)]">
          <Search className="h-4 w-4 text-[var(--color-primary)]" />
          {filteredStudents.length} registros visibles
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="glass border-[var(--color-border)] bg-[var(--color-surface)]">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-white">
              <span>Estado de Configuración</span>
              <span className="text-2xl font-bold text-emerald-300">
                {metrics.progress}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="h-3 overflow-hidden rounded-full bg-[var(--color-bg)] ring-1 ring-[var(--color-border)]"
              aria-label={`Avance ${metrics.progress}%`}
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${metrics.progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">
                {metrics.configured} configurados de {metrics.total} alumnos
              </span>
              <span className="font-medium text-emerald-300">
                {metrics.pending} pendientes
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-amber-500/25 bg-[var(--color-surface)]">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-white">
              <span>Alumnos Pendientes</span>
              <AlertTriangle className="h-5 w-5 text-amber-300" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-5xl font-bold tabular-nums text-amber-300">
                  {metrics.pending}
                </div>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  Requieren deuda anual antes de habilitar cobranza externa.
                </p>
              </div>
              <CheckCircle2 className="hidden h-12 w-12 text-emerald-400/50 sm:block" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="glass overflow-hidden rounded-2xl border-[var(--color-border)]">
        <div className="flex flex-col gap-4 border-b border-[var(--color-border)] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Alumnos por estado financiero
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Filtra rápido para detectar pendientes de configuración.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-1">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  filter === item.value
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-primary)] border-t-transparent" />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-16 text-center text-[var(--color-text-muted)]">
            No hay alumnos para el filtro seleccionado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--color-bg)]/50 text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                  <th className="px-6 py-4 whitespace-nowrap">RUT</th>
                  <th className="px-6 py-4">Nombre</th>
                  <th className="px-6 py-4">Curso</th>
                  <th className="px-6 py-4">Estado Financiero</th>
                  <th className="px-6 py-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredStudents.map((student) => {
                  const setup = getFinancialSetup(student);
                  return (
                    <tr
                      key={student.id}
                      className="transition-colors hover:bg-[var(--color-surface-hover)]"
                    >
                      <td className="px-6 py-4 font-mono text-sm tabular-nums text-[var(--color-text-secondary)] whitespace-nowrap">
                        {student.rut}
                      </td>
                      <td className="px-6 py-4 font-medium text-white">
                        {student.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-block rounded-lg bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-300">
                          {student.course?.name ?? "Sin curso"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant={
                            setup === "CONFIGURED" ? "success" : "destructive"
                          }
                        >
                          {STATUS_LABELS[setup]}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => console.log(student.id)}
                          className="rounded-lg border border-[var(--color-primary)]/40 px-3 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-[var(--color-primary-light)] hover:text-white"
                        >
                          Configurar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
