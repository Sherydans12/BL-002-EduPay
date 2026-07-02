"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { chargesApi, conceptsApi, paymentsApi, studentsApi } from "@/lib/api";
import type {
  ChargeStatus,
  Course,
  FinancialSetupStatus,
  Payment,
  PaymentConcept,
  PaymentMethod,
  Student,
} from "@/lib/api";
import { fetchAllCourses } from "@/lib/fetch-all-pages";
import { METHOD_LABELS } from "@/lib/payment-method-labels";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
const QUICK_PAYMENT_METHODS: PaymentMethod[] = [
  "TRANSFER",
  "CASH",
  "DEBIT",
  "CREDIT",
  "CHECK",
];

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

function getTodayInputValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateInput(value: string): string {
  const [year, month, day] = toDateInputValue(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
}

export default function FinancialSetupRadarPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>("PENDING");
  const [courseFilter, setCourseFilter] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<Payment[]>([]);
  const [paymentAssignments, setPaymentAssignments] = useState<
    Record<number, string>
  >({});
  const [concepts, setConcepts] = useState<PaymentConcept[]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quickPaymentIndex, setQuickPaymentIndex] = useState<number | null>(
    null,
  );
  const [quickPaymentMethod, setQuickPaymentMethod] =
    useState<PaymentMethod>("TRANSFER");
  const [quickPaymentDate, setQuickPaymentDate] =
    useState(getTodayInputValue());
  const [quickPaymentNotes, setQuickPaymentNotes] = useState("");
  const [quickPaymentSubmitting, setQuickPaymentSubmitting] = useState(false);

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
  const quickPaymentField =
    quickPaymentIndex == null ? null : fields[quickPaymentIndex];
  const quickPaymentCharge =
    quickPaymentIndex == null ? null : watchedCharges?.[quickPaymentIndex];
  const quickPaymentAmount = Math.max(
    Number(quickPaymentCharge?.amount ?? quickPaymentField?.amount ?? 0) -
      Number(
        quickPaymentCharge?.paidAmount ?? quickPaymentField?.paidAmount ?? 0,
      ),
    0,
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
        const [studentsData, coursesData] = await Promise.all([
          fetchAllStudentsForRadar(),
          fetchAllCourses(),
        ]);
        if (!cancelled) {
          setStudents(studentsData);
          setCourses(coursesData);
        }
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
    setPaymentAssignments({});
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
        const planRows = planRes.map((charge) => ({
          id: charge.id,
          conceptId: charge.conceptId,
          amount: charge.amount,
          dueDate: toDateInputValue(charge.dueDate),
          status: charge.status,
          paidAmount: charge.paidAmount,
        }));

        reset({
          charges: planRows,
        });
      }

      setPaymentAssignments(
        Object.fromEntries(
          paymentsRes.data.map((payment) => [
            payment.id,
            payment.chargeId ? `id:${payment.chargeId}` : "",
          ]),
        ),
      );
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

  const refreshConfiguredStudentContext = async (student: Student) => {
    const [paymentsRes, conceptsRes, planRes] = await Promise.all([
      paymentsApi.getAll({
        studentId: String(student.id),
        page: "1",
        limit: "20",
      }),
      conceptsApi.getAll(),
      chargesApi.getPlan(student.id),
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
    setPaymentAssignments(
      Object.fromEntries(
        paymentsRes.data.map((payment) => [
          payment.id,
          payment.chargeId ? `id:${payment.chargeId}` : "",
        ]),
      ),
    );
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
    const visibleStudents = students.filter((student) => {
      const matchesStatus =
        filter === "ALL" || getFinancialSetup(student) === filter;
      const matchesCourse =
        !courseFilter || String(student.courseId) === courseFilter;
      return matchesStatus && matchesCourse;
    });

    return [...visibleStudents].sort((a, b) => {
      const courseCompare = (a.course?.name ?? "").localeCompare(
        b.course?.name ?? "",
        "es-CL",
      );
      if (courseCompare !== 0) return courseCompare;
      return a.name.localeCompare(b.name, "es-CL");
    });
  }, [courseFilter, filter, students]);

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
    const fieldIndexByAssignmentValue = new Map(
      fields.map((field, index) => [
        field.id ? `id:${field.id}` : `field:${field.fieldId}`,
        index,
      ]),
    );

    const charges = data.charges.map((charge, index) => ({
      ...(isConfigured && fields[index]?.id
        ? { id: Number(fields[index].id) }
        : {}),
      conceptId: Number(charge.conceptId ?? fields[index]?.conceptId),
      amount: Number(charge.amount ?? fields[index]?.amount),
      dueDate: charge.dueDate || fields[index]?.dueDate || "",
    }));
    const paymentAllocations = paymentHistory.map((payment) => {
      const assignmentValue = paymentAssignments[payment.id] ?? "";
      const chargeIndex = fieldIndexByAssignmentValue.get(assignmentValue);

      return {
        paymentId: payment.id,
        ...(chargeIndex == null ? {} : { chargeIndex }),
      };
    });

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
        await chargesApi.updateFinancialPlan(selectedStudent.id, {
          charges,
          paymentAllocations,
        });
        toast.success("Plan financiero actualizado exitosamente");
      } else {
        await chargesApi.setupFinancialPlan(selectedStudent.id, {
          charges,
          paymentAllocations,
        });
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

  const openQuickPaymentDialog = (index: number) => {
    const field = fields[index];
    const charge = watchedCharges?.[index];
    const conceptId = Number(charge?.conceptId ?? field?.conceptId);
    const conceptName =
      concepts.find((concept) => concept.id === conceptId)?.name ?? "cuota";
    const dueDate = charge?.dueDate ?? field?.dueDate;

    setQuickPaymentIndex(index);
    setQuickPaymentMethod("TRANSFER");
    setQuickPaymentDate(getTodayInputValue());
    setQuickPaymentNotes(
      `Regularización rápida de ${conceptName}${
        dueDate ? ` con vencimiento ${formatDateInput(dueDate)}` : ""
      }`,
    );
  };

  const closeQuickPaymentDialog = () => {
    setQuickPaymentIndex(null);
    setQuickPaymentMethod("TRANSFER");
    setQuickPaymentDate(getTodayInputValue());
    setQuickPaymentNotes("");
  };

  const handleQuickPaymentSubmit = async () => {
    if (!selectedStudent || quickPaymentIndex == null) return;

    const field = fields[quickPaymentIndex];
    if (!field?.id) {
      toast.error("Guarda la cuota antes de marcarla como pagada");
      return;
    }

    setQuickPaymentSubmitting(true);
    try {
      await paymentsApi.markChargePaid(Number(field.id), {
        method: quickPaymentMethod,
        paymentDate: quickPaymentDate,
        notes: quickPaymentNotes,
      });
      toast.success("Pago rápido creado y cuota marcada como pagada");
      closeQuickPaymentDialog();
      await refreshConfiguredStudentContext(selectedStudent);
      await reloadStudents();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al crear pago rápido",
      );
    } finally {
      setQuickPaymentSubmitting(false);
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
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <NativeSelectField className="w-full md:w-56">
              <select
                value={courseFilter}
                onChange={(event) => setCourseFilter(event.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)]"
              >
                <option value="">Todos los cursos</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </NativeSelectField>
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
            setPaymentAssignments({});
            reset({ charges: [] });
          }
        }}
      >
        <SheetContent className="sm:max-w-[min(96vw,1440px)]">
          <SheetHeader className="bg-[var(--color-bg)]/35">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <SheetTitle className="text-2xl">
                  {isEditing
                    ? "Reestructurar Deuda Anual"
                    : "Configurar Nueva Deuda"}
                </SheetTitle>
                <SheetDescription className="text-base">
                  {selectedStudent?.name ?? ""}
                </SheetDescription>
                <p className="max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">
                  {isEditing
                    ? "Ajusta el plan financiero, reasigna pagos históricos y regulariza cuotas pendientes sin perder trazabilidad contable."
                    : "Crea la estructura anual de cobros y deja los pagos históricos listos para asignar."}
                </p>
              </div>
              {selectedStudent ? (
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Badge variant="secondary">
                    {selectedStudent.course?.name ?? "Sin curso"}
                  </Badge>
                  <Badge
                    variant={
                      getFinancialSetup(selectedStudent) === "CONFIGURED"
                        ? "success"
                        : "warning"
                    }
                  >
                    {STATUS_LABELS[getFinancialSetup(selectedStudent)]}
                  </Badge>
                </div>
              ) : null}
            </div>
          </SheetHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden xl:grid-cols-[minmax(430px,0.95fr)_minmax(680px,1.45fr)]">
            <section className="min-h-0 overflow-y-auto border-b border-[var(--color-border)] p-5 xl:border-r xl:border-b-0 xl:p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Historial de pagos
                  </h3>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Asigna cada pago a la cuota que corresponde o déjalo sin
                    aplicar.
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
                <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                  <table className="min-w-[820px] w-full text-sm">
                    <thead className="bg-[var(--color-bg)]/60 text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                      <tr>
                        <th className="w-32 px-4 py-3">Fecha</th>
                        <th className="min-w-44 px-4 py-3">Concepto</th>
                        <th className="w-32 px-4 py-3 text-right">Monto</th>
                        <th className="min-w-80 px-4 py-3">Aplicar a</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {paymentHistory.map((payment) => (
                        <tr key={payment.id}>
                          <td className="px-4 py-3 text-[var(--color-text-secondary)] whitespace-nowrap">
                            {formatDate(payment.paymentDate)}
                          </td>
                          <td className="px-4 py-3 text-white">
                            {payment.concept?.name ?? "Sin concepto"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-300 tabular-nums whitespace-nowrap">
                            {formatCurrency(payment.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <NativeSelectField>
                              <select
                                value={paymentAssignments[payment.id] ?? ""}
                                onChange={(event) =>
                                  setPaymentAssignments((current) => ({
                                    ...current,
                                    [payment.id]: event.target.value,
                                  }))
                                }
                                disabled={fields.length === 0}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <option value="">Sin asignar a cuota</option>
                                {fields.map((field, chargeIndex) => {
                                  const watchedCharge =
                                    watchedCharges?.[chargeIndex];
                                  const conceptId = Number(
                                    watchedCharge?.conceptId ?? field.conceptId,
                                  );
                                  const conceptName =
                                    concepts.find(
                                      (concept) => concept.id === conceptId,
                                    )?.name ?? "Cuota";
                                  const amount = Number(
                                    watchedCharge?.amount ?? field.amount ?? 0,
                                  );
                                  const dueDate =
                                    watchedCharge?.dueDate ?? field.dueDate;

                                  return (
                                    <option
                                      key={field.fieldId}
                                      value={
                                        field.id
                                          ? `id:${field.id}`
                                          : `field:${field.fieldId}`
                                      }
                                    >
                                      {formatDateInput(dueDate)} · {conceptName}{" "}
                                      · {formatCurrency(amount)}
                                    </option>
                                  );
                                })}
                              </select>
                            </NativeSelectField>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="min-h-0 overflow-y-auto p-5 xl:p-6">
              {isEditing ? (
                <Alert
                  variant="default"
                  className="mb-6 border-amber-200 bg-amber-50 text-amber-800"
                >
                  <Info className="h-4 w-4" />
                  <div>
                    <AlertTitle>Setup financiero activo</AlertTitle>
                    <AlertDescription className="text-amber-700">
                      Estás reestructurando una deuda vigente. Las cuotas
                      pagadas permanecen bloqueadas, pero puedes mover sus pagos
                      a la cuota correcta desde el historial antes de guardar.
                    </AlertDescription>
                  </div>
                </Alert>
              ) : null}

              <div className="mb-5 flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/30 p-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
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
                  <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm font-medium text-emerald-100">
                      Deuda Anual Proyectada:
                    </span>
                    <span className="text-3xl font-bold tabular-nums text-emerald-300">
                      {formatCurrency(projectedAnnualDebt)}
                    </span>
                  </CardContent>
                </Card>

                {fields.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
                    Agrega cuotas manualmente o carga el plan estándar.
                  </div>
                ) : (
                  <div className="space-y-4">
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
                          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/45 p-4"
                        >
                          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-[var(--color-surface)] px-2 text-xs font-semibold text-[var(--color-text-secondary)]">
                                {index + 1}
                              </span>
                              {isLocked ? (
                                <Badge
                                  variant="secondary"
                                  className="border-emerald-200 bg-emerald-100 text-emerald-800"
                                >
                                  {isPaid ? "Pagada" : "Abonada"}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Editable</Badge>
                              )}
                            </div>
                            {paidAmount > 0 ? (
                              <p className="text-sm font-medium text-emerald-300">
                                Abonado: {formatCurrency(paidAmount)}
                              </p>
                            ) : null}
                          </div>

                          <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_minmax(170px,0.45fr)_minmax(190px,0.55fr)_auto]">
                            <div className="min-w-0">
                              <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                                Concepto
                              </label>
                              <NativeSelectField className="mt-1.5">
                                <select
                                  {...register(`charges.${index}.conceptId`, {
                                    valueAsNumber: true,
                                  })}
                                  disabled={isLocked}
                                  className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-70"
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
                              <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                                Vencimiento
                              </label>
                              <input
                                type="date"
                                {...register(`charges.${index}.dueDate`)}
                                disabled={isLocked}
                                className="mt-1.5 h-11 w-full min-w-40 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-70"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
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
                                className="mt-1.5 h-11 w-full min-w-44 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-right text-base font-semibold tabular-nums text-white outline-none transition-colors focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-70"
                              />
                            </div>
                            <div className="flex items-end justify-end gap-2">
                              {!isPaid && field.id ? (
                                <button
                                  type="button"
                                  onClick={() => openQuickPaymentDialog(index)}
                                  className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-500/35 px-3 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200"
                                  title="Crear pago rápido por el saldo pendiente"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  Pagar
                                </button>
                              ) : null}
                              {!isLocked ? (
                                <button
                                  type="button"
                                  onClick={() => remove(index)}
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                                  aria-label="Eliminar cuota"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : (
                                <div
                                  className="inline-flex h-11 w-11 items-center justify-center"
                                  title="Cuota con pagos y bloqueada"
                                  aria-label="Cuota con pagos y bloqueada"
                                >
                                  <Lock className="h-4 w-4 text-slate-400" />
                                </div>
                              )}
                            </div>
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

      <Dialog
        open={quickPaymentIndex != null}
        onOpenChange={(open) => {
          if (!open && !quickPaymentSubmitting) closeQuickPaymentDialog();
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Crear pago rápido</DialogTitle>
            <DialogDescription>
              Se registrará un pago por el saldo pendiente de la cuota y la
              boleta quedará pendiente para completar después.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-100">
              Saldo a registrar
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-300">
              {formatCurrency(quickPaymentAmount)}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Fecha de pago
              </label>
              <input
                type="date"
                value={quickPaymentDate}
                onChange={(event) => setQuickPaymentDate(event.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Método
              </label>
              <NativeSelectField>
                <select
                  value={quickPaymentMethod}
                  onChange={(event) =>
                    setQuickPaymentMethod(event.target.value as PaymentMethod)
                  }
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)]"
                >
                  {QUICK_PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {METHOD_LABELS[method] ?? method}
                    </option>
                  ))}
                </select>
              </NativeSelectField>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Observación
            </label>
            <textarea
              value={quickPaymentNotes}
              onChange={(event) => setQuickPaymentNotes(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)]"
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={closeQuickPaymentDialog}
              disabled={quickPaymentSubmitting}
              className="px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-white disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleQuickPaymentSubmit}
              disabled={
                quickPaymentSubmitting ||
                quickPaymentAmount <= 0 ||
                !quickPaymentField?.id
              }
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {quickPaymentSubmitting ? "Creando..." : "Crear pago"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
