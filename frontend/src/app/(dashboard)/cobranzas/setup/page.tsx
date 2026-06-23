"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { chargesApi, conceptsApi, paymentsApi, studentsApi } from "@/lib/api";
import type {
  ChargeStatus,
  FinancialSetupStatus,
  Payment,
  PaymentConcept,
  Student,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Info,
  Lock,
  Plus,
  Search,
  Trash2,
  Wand2,
} from "lucide-react";

type FilterMode = "PENDING" | "CONFIGURED" | "ALL";

type ChargeFormRow = {
  id?: number;
  conceptId?: number;
  amount?: number;
  dueDate: string;
  status?: ChargeStatus;
  paidAmount?: number;
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

const STANDARD_CHARGE_AMOUNT = 220000;

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

function toDateInputValue(value: string): string {
  return value.includes("T") ? value.split("T")[0] : value.slice(0, 10);
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
    keyName: "fieldId",
  });
  const watchedCharges = useWatch({ control, name: "charges" });
  const isEditing = selectedStudent?.financialSetup === "CONFIGURED";
  const projectedAnnualDebt = useMemo(
    () =>
      (watchedCharges ?? []).reduce(
        (total, charge) => total + (Number(charge.amount) || 0),
        0,
      ),
    [watchedCharges],
  );

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
      const isConfigured = getFinancialSetup(student) === "CONFIGURED";
      const [paymentsRes, conceptsRes, planRes] = await Promise.all([
        paymentsApi.getAll({
          studentId: String(student.id),
          page: "1",
          limit: "20",
        }),
        conceptsApi.getAll(),
        isConfigured ? chargesApi.getPlan(student.id) : Promise.resolve([]),
      ]);

      const activeConcepts = conceptsRes.filter((concept) => concept.isActive);
      const activeConceptIds = new Set(
        activeConcepts.map((concept) => concept.id),
      );
      const planConcepts = planRes
        .map((charge) => charge.concept)
        .filter(
          (concept) => concept && !activeConceptIds.has(concept.id),
        ) as PaymentConcept[];

      setPaymentHistory(paymentsRes.data);
      setConcepts([...activeConcepts, ...planConcepts]);

      if (isConfigured) {
        reset({
          charges: planRes.map((charge) => ({
            id: charge.id,
            conceptId: charge.conceptId,
            amount: charge.amount,
            dueDate: toDateInputValue(charge.dueDate),
            status: charge.status,
            paidAmount: charge.paidAmount,
          })),
        });
      }
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
    const fallbackConcept = concepts[0];
    const enrollmentConcept =
      concepts.find((concept) =>
        normalizeConceptName(concept.name).includes("matricula"),
      ) ?? fallbackConcept;
    const monthlyConcept =
      concepts.find((concept) =>
        normalizeConceptName(concept.name).includes("mensualidad general"),
      ) ??
      concepts.find((concept) =>
        normalizeConceptName(concept.name).includes("mensualidad"),
      ) ??
      fallbackConcept;

    if (!fallbackConcept) {
      toast.error("No hay conceptos activos para generar el año escolar");
      return;
    }

    replace([
      {
        conceptId: enrollmentConcept.id,
        amount: STANDARD_CHARGE_AMOUNT,
        dueDate: buildDueDate(year, 2),
      },
      ...Array.from({ length: 10 }, (_, index) => {
        const monthIndex = index + 2;
        return {
          conceptId: monthlyConcept.id,
          amount: STANDARD_CHARGE_AMOUNT,
          dueDate: buildDueDate(year, monthIndex),
        };
      }),
    ]);
  };

  const submitFinancialPlan = async (data: FinancialPlanForm) => {
    if (!selectedStudent) return;
    const isConfigured = getFinancialSetup(selectedStudent) === "CONFIGURED";

    const charges = data.charges.map((charge, index) => ({
      ...(isConfigured && fields[index]?.id
        ? { id: Number(fields[index].id) }
        : {}),
      conceptId: Number(charge.conceptId ?? fields[index]?.conceptId),
      amount: Number(charge.amount ?? fields[index]?.amount),
      dueDate: charge.dueDate || fields[index]?.dueDate || "",
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
      if (isConfigured) {
        await chargesApi.updateFinancialPlan(selectedStudent.id, { charges });
        toast.success("Plan financiero actualizado exitosamente");
      } else {
        await chargesApi.setupFinancialPlan(selectedStudent.id, { charges });
        toast.success("Plan financiero configurado exitosamente");
      }
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
          <Tabs
            defaultValue="PENDING"
            onValueChange={(value) => setFilter(value as FilterMode)}
            value={filter}
            className="w-auto"
          >
            <TabsList>
              {FILTERS.map((item) => (
                <TabsTrigger key={item.value} value={item.value}>
                  {item.value === "PENDING" ? "Pendientes" : item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
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
                  <th className="px-6 py-4 text-right">Acciones</th>
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
                        <div className="inline-flex items-center justify-end gap-2">
                          <Link
                            href={`/alumnos/${student.id}/finanzas`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 px-3 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200"
                            aria-label={`Ver ficha financiera de ${student.name}`}
                          >
                            <FileText className="h-4 w-4" />
                            Ficha
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              void openSetupSheet(student);
                            }}
                            className="rounded-lg border border-[var(--color-primary)]/40 px-3 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-[var(--color-primary-light)] hover:text-white"
                          >
                            Configurar
                          </button>
                        </div>
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
              {isEditing
                ? "Reestructurar Deuda Anual"
                : "Configurar Nueva Deuda"}
              {selectedStudent ? ` · ${selectedStudent.name}` : ""}
            </SheetTitle>
            <SheetDescription>
              {isEditing
                ? "Modifica las cuotas futuras. Las cuotas ya pagadas están bloqueadas por seguridad."
                : "Crea la estructura de cobros anuales para este alumno."}
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
              {isEditing ? (
                <Alert
                  variant="default"
                  className="mb-6 border-amber-200 bg-amber-50 text-amber-800"
                >
                  <Info className="h-4 w-4" />
                  <div>
                    <AlertTitle>Setup financiero activo</AlertTitle>
                    <AlertDescription className="text-amber-700">
                      Estás reestructurando una deuda vigente. Las cuotas pagadas
                      permanecen bloqueadas y no pueden eliminarse ni reducirse.
                    </AlertDescription>
                  </div>
                </Alert>
              ) : null}

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
                  disabled={
                    sheetLoading ||
                    concepts.length === 0 ||
                    (selectedStudent
                      ? getFinancialSetup(selectedStudent) === "CONFIGURED"
                      : false)
                  }
                >
                  <Wand2 className="h-4 w-4" />
                  Cargar Año Escolar Estándar
                </button>
              </div>

              <form
                onSubmit={handleSubmit(submitFinancialPlan)}
                className="space-y-4"
              >
                <Card className="border-emerald-500/25 bg-emerald-500/10">
                  <CardContent className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-medium text-emerald-100">
                      Deuda Anual Proyectada:
                    </span>
                    <span className="text-2xl font-bold tabular-nums text-emerald-300">
                      {formatCurrency(projectedAnnualDebt)}
                    </span>
                  </CardContent>
                </Card>

                {fields.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
                    Agrega cuotas manualmente o carga el plan estándar.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {fields.map((field, index) => {
                      const watchedCharge = watchedCharges?.[index];
                      const paidAmount = Number(
                        watchedCharge?.paidAmount ?? field.paidAmount ?? 0,
                      );
                      const amount = Number(
                        watchedCharge?.amount ?? field.amount ?? 0,
                      );
                      const isPaid =
                        field.status === "PAID" ||
                        (amount > 0 && paidAmount >= amount);
                      const hasPayments = paidAmount > 0;
                      const isLocked = isPaid || hasPayments;

                      return (
                        <div
                          key={field.fieldId}
                          className="grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/45 p-3 md:grid-cols-[1.4fr_0.9fr_0.9fr_auto]"
                        >
                          <div>
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                                Concepto
                              </label>
                              {isLocked ? (
                                <Badge
                                  variant="secondary"
                                  className="border-emerald-200 bg-emerald-100 text-emerald-800"
                                >
                                  {isPaid ? "Pagada" : "Abonada"}
                                </Badge>
                              ) : null}
                            </div>
                            <NativeSelectField>
                              <select
                                {...register(`charges.${index}.conceptId`, {
                                  valueAsNumber: true,
                                })}
                                disabled={isLocked}
                                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-70"
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
                              disabled={isLocked}
                              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-70"
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
                              disabled={isLocked}
                              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-70"
                            />
                            {paidAmount > 0 ? (
                              <p className="mt-1 text-xs text-emerald-300">
                                Abonado: {formatCurrency(paidAmount)}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex items-end">
                            {!isLocked ? (
                              <button
                                type="button"
                                onClick={() => remove(index)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                                aria-label="Eliminar cuota"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : (
                              <div
                                className="inline-flex h-10 w-10 items-center justify-center"
                                title="Cuota con pagos y bloqueada"
                                aria-label="Cuota con pagos y bloqueada"
                              >
                                <Lock className="h-4 w-4 text-slate-400" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
                        status: "PENDING",
                        paidAmount: 0,
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
                    {submitting
                      ? "Guardando..."
                      : isEditing
                        ? "Guardar Reestructuración"
                        : "Crear Setup Financiero"}
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
