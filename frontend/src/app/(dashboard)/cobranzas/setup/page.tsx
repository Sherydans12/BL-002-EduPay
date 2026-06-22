"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { chargesApi, conceptsApi, paymentsApi, studentsApi } from "@/lib/api";
import type {
  FinancialSetupStatus,
  Payment,
  PaymentConcept,
  Student,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";

type FilterMode = "PENDING" | "CONFIGURED" | "ALL";

type ChargeFormRow = {
  conceptId?: number;
  amount?: number;
  dueDate: string;
};

type FinancialPlanForm = {
  charges: ChargeFormRow[];
};

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function normalizeConceptName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildDueDate(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-05`;
}

export default function FinancialSetupRadarPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("PENDING");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<Payment[]>([]);
  const [concepts, setConcepts] = useState<PaymentConcept[]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { control, register, handleSubmit, reset } = useForm<FinancialPlanForm>(
    {
      defaultValues: { charges: [] },
    },
  );

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "charges",
  });

  const reloadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllStudentsForRadar();
      setStudents(data);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al cargar radar financiero",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
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

  const openSetupSheet = async (student: Student) => {
    setSelectedStudent(student);
    reset({ charges: [] });
    setPaymentHistory([]);
    setSheetLoading(true);

    try {
      const [paymentsRes, conceptsRes] = await Promise.all([
        paymentsApi.getAll({
          studentId: String(student.id),
          page: "1",
          limit: "20",
        }),
        conceptsApi.getAll(),
      ]);
      setPaymentHistory(paymentsRes.data);
      setConcepts(conceptsRes.filter((concept) => concept.isActive));
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Error al cargar contexto financiero",
      );
    } finally {
      setSheetLoading(false);
    }
  };

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

  const loadStandardSchoolYear = () => {
    const year = new Date().getFullYear();
    const enrollmentConcept = concepts.find((concept) =>
      normalizeConceptName(concept.name).includes("matricula"),
    );
    const monthlyConcept =
      concepts.find((concept) =>
        normalizeConceptName(concept.name).includes("mensualidad general"),
      ) ??
      concepts.find((concept) =>
        normalizeConceptName(concept.name).includes("mensualidad"),
      );

    if (!enrollmentConcept || !monthlyConcept) {
      toast.error(
        "Faltan conceptos activos de Matrícula o Mensualidad General",
      );
      return;
    }

    replace([
      {
        conceptId: enrollmentConcept.id,
        amount: enrollmentConcept.defaultAmount,
        dueDate: buildDueDate(year, 2),
      },
      ...Array.from({ length: 10 }, (_, index) => {
        const monthIndex = index + 2;
        return {
          conceptId: monthlyConcept.id,
          amount: monthlyConcept.defaultAmount,
          dueDate: buildDueDate(year, monthIndex),
        };
      }),
    ]);
  };

  const submitFinancialPlan = async (data: FinancialPlanForm) => {
    if (!selectedStudent) return;

    const charges = data.charges.map((charge) => ({
      conceptId: Number(charge.conceptId),
      amount: Number(charge.amount),
      dueDate: charge.dueDate,
    }));

    if (
      charges.length === 0 ||
      charges.some(
        (charge) => !charge.conceptId || !charge.amount || !charge.dueDate,
      )
    ) {
      toast.error("Completa concepto, vencimiento y monto en todas las filas");
      return;
    }

    setSubmitting(true);
    try {
      await chargesApi.setupFinancialPlan(selectedStudent.id, { charges });
      toast.success("Plan financiero configurado exitosamente");
      setSelectedStudent(null);
      reset({ charges: [] });
      await reloadStudents();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al configurar deuda",
      );
    } finally {
      setSubmitting(false);
    }
  };

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
                          onClick={() => {
                            console.log(student.id);
                            void openSetupSheet(student);
                          }}
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

      <Sheet
        open={!!selectedStudent}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedStudent(null);
            reset({ charges: [] });
          }
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              Configurar deuda anual
              {selectedStudent ? ` · ${selectedStudent.name}` : ""}
            </SheetTitle>
            <SheetDescription>
              Revisa pagos históricos antes de generar los cargos de cuentas por
              cobrar.
            </SheetDescription>
          </SheetHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[0.95fr_1.25fr]">
            <section className="min-h-0 overflow-y-auto border-b border-[var(--color-border)] p-6 lg:border-r lg:border-b-0">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Historial de pagos
                  </h3>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Últimos registros asociados al alumno seleccionado.
                  </p>
                </div>
                <Badge variant="secondary">
                  {paymentHistory.length} pago(s)
                </Badge>
              </div>

              {sheetLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
                </div>
              ) : paymentHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
                  No hay pagos históricos para este alumno.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-bg)]/60 text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                      <tr>
                        <th className="px-3 py-3">Fecha</th>
                        <th className="px-3 py-3">Concepto</th>
                        <th className="px-3 py-3 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {paymentHistory.map((payment) => (
                        <tr key={payment.id}>
                          <td className="px-3 py-3 text-[var(--color-text-secondary)]">
                            {formatDate(payment.paymentDate)}
                          </td>
                          <td className="px-3 py-3 text-white">
                            {payment.concept?.name ?? "Sin concepto"}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-emerald-300 tabular-nums">
                            {formatCurrency(payment.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="min-h-0 overflow-y-auto p-6">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Generador de cuotas
                  </h3>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Crea cargos iniciales para el año escolar actual.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadStandardSchoolYear}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/35 px-3 py-2 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-500/10 hover:text-white"
                  disabled={sheetLoading || concepts.length === 0}
                >
                  <Wand2 className="h-4 w-4" />
                  Cargar Año Escolar Estándar
                </button>
              </div>

              <form
                onSubmit={handleSubmit(submitFinancialPlan)}
                className="space-y-4"
              >
                {fields.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
                    Agrega cuotas manualmente o carga el plan estándar.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/45 p-3 md:grid-cols-[1.4fr_0.9fr_0.9fr_auto]"
                      >
                        <div>
                          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                            Concepto
                          </label>
                          <NativeSelectField>
                            <select
                              {...register(`charges.${index}.conceptId`, {
                                valueAsNumber: true,
                              })}
                              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)]"
                            >
                              <option value="">Seleccionar...</option>
                              {concepts.map((concept) => (
                                <option key={concept.id} value={concept.id}>
                                  {concept.name}
                                </option>
                              ))}
                            </select>
                          </NativeSelectField>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                            Vencimiento
                          </label>
                          <input
                            type="date"
                            {...register(`charges.${index}.dueDate`)}
                            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)]"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                            Monto
                          </label>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            {...register(`charges.${index}.amount`, {
                              valueAsNumber: true,
                            })}
                            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)]"
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                            aria-label="Eliminar cuota"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      append({
                        conceptId: concepts[0]?.id,
                        amount: concepts[0]?.defaultAmount,
                        dueDate: buildDueDate(new Date().getFullYear(), 2),
                      })
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Añadir cuota
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || fields.length === 0}
                    className="rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? "Guardando..." : "Guardar configuración"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
