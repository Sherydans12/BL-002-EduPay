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
  User,
  Users,
  CreditCard,
  Sparkles,
  SlidersHorizontal,
  X,
  RotateCcw,
  Calendar,
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
  PENDING: "Pendiente de Setup",
  CONFIGURED: "Configurado",
};

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

function buildDueDate(year: number, monthIndex: number, day = 5): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<Payment[]>([]);
  const [paymentAssignments, setPaymentAssignments] = useState<
    Record<number, string>
  >({});
  const [concepts, setConcepts] = useState<PaymentConcept[]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Generator Config State
  const [showGeneratorOptions, setShowGeneratorOptions] = useState(false);
  const [genEnrollmentAmount, setGenEnrollmentAmount] = useState<number>(45000);
  const [genMonthlyAmount, setGenMonthlyAmount] = useState<number>(45000);
  const [genIncludeEnrollment, setGenIncludeEnrollment] = useState<boolean>(true);
  const [genMonthsCount, setGenMonthsCount] = useState<number>(10);
  const [genDueDay, setGenDueDay] = useState<number>(5);

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

  const totalPaidInCharges = useMemo(
    () =>
      (watchedCharges ?? []).reduce(
        (total, charge) => total + (Number(charge.paidAmount) || 0),
        0,
      ),
    [watchedCharges],
  );

  const pendingDebtBalance = Math.max(projectedAnnualDebt - totalPaidInCharges, 0);

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
    setShowGeneratorOptions(false);
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

      const allConcepts = [...activeConcepts, ...planConcepts];
      setPaymentHistory(paymentsRes.data);
      setConcepts(allConcepts);

      // Initialize generator defaults from concepts
      const matriculaConcept = allConcepts.find((c) =>
        normalizeConceptName(c.name).includes("matricula"),
      );
      const mensualidadConcept = allConcepts.find((c) =>
        normalizeConceptName(c.name).includes("mensualidad"),
      );

      if (matriculaConcept?.defaultAmount) {
        setGenEnrollmentAmount(matriculaConcept.defaultAmount);
      }
      if (mensualidadConcept?.defaultAmount) {
        setGenMonthlyAmount(mensualidadConcept.defaultAmount);
      }

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
    const term = searchTerm.trim().toLowerCase();
    const visibleStudents = students.filter((student) => {
      const matchesStatus =
        filter === "ALL" || getFinancialSetup(student) === filter;
      const matchesCourse =
        !courseFilter || String(student.courseId) === courseFilter;
      const matchesSearch =
        !term ||
        student.name.toLowerCase().includes(term) ||
        (student.rut && student.rut.toLowerCase().includes(term)) ||
        (student.guardian?.name &&
          student.guardian.name.toLowerCase().includes(term));
      return matchesStatus && matchesCourse && matchesSearch;
    });

    return [...visibleStudents].sort((a, b) => {
      const courseCompare = (a.course?.name ?? "").localeCompare(
        b.course?.name ?? "",
        "es-CL",
      );
      if (courseCompare !== 0) return courseCompare;
      return a.name.localeCompare(b.name, "es-CL");
    });
  }, [courseFilter, filter, searchTerm, students]);

  const generatePlan = () => {
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

    const generatedCharges: ChargeFormRow[] = [];

    // Matricula (si está marcada)
    if (genIncludeEnrollment && enrollmentConcept) {
      generatedCharges.push({
        conceptId: enrollmentConcept.id,
        amount: genEnrollmentAmount || 45000,
        dueDate: buildDueDate(year, 2, genDueDay), // Marzo
        status: "PENDING",
        paidAmount: 0,
      });
    }

    // Mensualidades (Marzo a Diciembre por defecto)
    for (let index = 0; index < genMonthsCount; index++) {
      const monthIndex = index + 2; // mes 2 = marzo, mes 11 = diciembre
      if (monthIndex > 11) break; // no pasar de diciembre
      generatedCharges.push({
        conceptId: monthlyConcept.id,
        amount: genMonthlyAmount || 45000,
        dueDate: buildDueDate(year, monthIndex, genDueDay),
        status: "PENDING",
        paidAmount: 0,
      });
    }

    replace(generatedCharges);
    setShowGeneratorOptions(false);
    toast.success(`Plan de ${generatedCharges.length} cuotas generado`);
  };

  const removeUnpaidCharges = () => {
    const unpaidIndexes: number[] = [];
    fields.forEach((field, index) => {
      const paid = Number(field.paidAmount ?? 0);
      if (paid === 0 && field.status !== "PAID") {
        unpaidIndexes.push(index);
      }
    });

    if (unpaidIndexes.length === 0) {
      toast.info("No hay cuotas sin pagos para eliminar");
      return;
    }

    // remove in reverse order so indexes stay valid
    remove(unpaidIndexes);
    toast.info(`${unpaidIndexes.length} cuota(s) eliminada(s)`);
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
    <div className="mx-auto max-w-7xl space-y-6 pb-16 animate-fade-in">
      {/* Cabecera Principal */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <span>Radar de Configuración Financiera</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--color-text-secondary)]">
            Auditoría de alumnos y estructuración de deuda anual para cobros y pasarela.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/pagos/nuevo"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-600/35 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <CreditCard className="h-4 w-4" />
            Registrar Pago
          </Link>
        </div>
      </div>

      {/* Tarjetas de Estadísticas / KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Avance de Configuración */}
        <Card className="glass border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-3 text-white text-base">
              <span>Avance de Configuración</span>
              <span className="text-xl font-bold font-mono text-emerald-300">
                {metrics.progress}%
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="h-2.5 overflow-hidden rounded-full bg-[var(--color-bg)] ring-1 ring-[var(--color-border)]"
              aria-label={`Avance ${metrics.progress}%`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                style={{ width: `${metrics.progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
              <span>{metrics.configured} de {metrics.total} configurados</span>
              <span className="font-semibold text-emerald-400">{metrics.progress}% listo</span>
            </div>
          </CardContent>
        </Card>

        {/* Alumnos Pendientes */}
        <Card
          onClick={() => setFilter("PENDING")}
          className={`glass border transition-all cursor-pointer hover:scale-[1.01] shadow-sm ${
            metrics.pending > 0
              ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-400"
              : "border-[var(--color-border)] bg-[var(--color-surface)]"
          }`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-3 text-white text-base">
              <span>Alumnos Pendientes</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-3xl font-bold font-mono text-amber-300">
                {metrics.pending}
              </div>
              <span className="text-xs text-amber-200/80 font-medium">
                Sin plan de cobro anual
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Alumnos Listos para Cobro */}
        <Card
          onClick={() => setFilter("CONFIGURED")}
          className="glass border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm cursor-pointer hover:scale-[1.01] transition-all"
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-3 text-white text-base">
              <span>Alumnos Operativos</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-3xl font-bold font-mono text-emerald-300">
                {metrics.configured}
              </div>
              <span className="text-xs text-[var(--color-text-secondary)] font-medium">
                Con deuda y pasarela activa
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="glass overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-sm">
        <div className="flex flex-col gap-3.5 border-b border-[var(--color-border)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Input de Búsqueda Instantánea */}
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, RUT de alumno o apoderado..."
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] py-2.5 pl-10 pr-10 text-sm text-white placeholder-[var(--color-text-muted)] outline-none transition-colors focus:border-[var(--color-primary)]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Selector de Curso */}
              <NativeSelectField className="min-w-[200px]">
                <select
                  value={courseFilter}
                  onChange={(event) => setCourseFilter(event.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-[var(--color-primary)]"
                >
                  <option value="">Todos los cursos</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </NativeSelectField>

              {/* Selector de Estado */}
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

          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] pt-1">
            <span>
              Mostrando <strong className="text-white">{filteredStudents.length}</strong> alumnos encontrados
            </span>
            {(searchTerm || courseFilter || filter !== "PENDING") && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setCourseFilter("");
                  setFilter("PENDING");
                }}
                className="text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Restablecer filtros
              </button>
            )}
          </div>
        </div>

        {/* Tabla de Alumnos */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-primary)] border-t-transparent" />
            <span className="text-xs text-[var(--color-text-muted)]">Cargando radar financiero...</span>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-20 text-center space-y-2 text-[var(--color-text-muted)]">
            <Users className="w-8 h-8 mx-auto text-[var(--color-text-muted)]/60" />
            <p className="text-sm font-medium text-white">No se encontraron alumnos</p>
            <p className="text-xs">Prueba cambiando el término de búsqueda o el curso seleccionado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--color-bg)]/60 text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  <th className="px-6 py-3.5 whitespace-nowrap">RUT</th>
                  <th className="px-6 py-3.5">Alumno</th>
                  <th className="px-6 py-3.5">Curso</th>
                  <th className="px-6 py-3.5">Apoderado</th>
                  <th className="px-6 py-3.5">Estado Financiero</th>
                  <th className="px-6 py-3.5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredStudents.map((student) => {
                  const setup = getFinancialSetup(student);
                  return (
                    <tr
                      key={student.id}
                      className="transition-colors hover:bg-[var(--color-surface-hover)] group"
                    >
                      {/* RUT */}
                      <td className="px-6 py-4 font-mono text-xs tabular-nums text-[var(--color-text-secondary)] whitespace-nowrap">
                        {student.rut}
                      </td>

                      {/* Alumno */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-300 font-semibold text-xs shrink-0">
                            {student.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-white text-sm">
                            {student.name}
                          </span>
                        </div>
                      </td>

                      {/* Curso */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-block rounded-lg bg-blue-500/15 border border-blue-500/30 px-2.5 py-1 text-xs font-medium text-blue-300">
                          {student.course?.name ?? "Sin curso"}
                        </span>
                      </td>

                      {/* Apoderado */}
                      <td className="px-6 py-4 text-xs text-[var(--color-text-secondary)]">
                        {student.guardian?.name ? (
                          <div className="flex flex-col">
                            <span className="text-white font-medium">{student.guardian.name}</span>
                            {student.guardian.email && (
                              <span className="text-[11px] text-[var(--color-text-muted)] truncate max-w-[180px]">
                                {student.guardian.email}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--color-text-muted)] italic">Sin apoderado asignado</span>
                        )}
                      </td>

                      {/* Estado Financiero */}
                      <td className="px-6 py-4">
                        <Badge
                          variant={
                            setup === "CONFIGURED" ? "success" : "destructive"
                          }
                          className={`gap-1 ${
                            setup === "CONFIGURED"
                              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25"
                              : "bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
                          }`}
                        >
                          {setup === "CONFIGURED" ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <AlertTriangle className="w-3 h-3" />
                          )}
                          {STATUS_LABELS[setup]}
                        </Badge>
                      </td>

                      {/* Acciones */}
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          {/* Ficha Financiera */}
                          <Link
                            href={`/alumnos/${student.id}/finanzas`}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/35 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200"
                            title="Ver cartola y ficha financiera"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span>Ficha</span>
                          </Link>

                          {/* Configurar / Reestructurar Deuda */}
                          <button
                            type="button"
                            onClick={() => {
                              void openSetupSheet(student);
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                              setup === "CONFIGURED"
                                ? "border border-blue-500/35 text-blue-300 hover:bg-blue-500/10 hover:text-white"
                                : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm hover:shadow-blue-600/30"
                            }`}
                          >
                            <Wand2 className="h-3.5 w-3.5" />
                            <span>{setup === "CONFIGURED" ? "Reestructurar" : "Configurar"}</span>
                          </button>

                          {/* Registrar Pago Directo */}
                          <Link
                            href={`/pagos/nuevo?studentId=${student.id}`}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[var(--color-surface-hover)] border border-transparent hover:border-[var(--color-border)] transition-colors"
                            title="Registrar pago directo para este alumno"
                          >
                            <CreditCard className="h-4 w-4" />
                          </Link>
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

      {/* Sheet / Drawer de Configuración y Reestructuración de Deuda */}
      <Sheet
        open={!!selectedStudent}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedStudent(null);
            setPaymentAssignments({});
            setShowGeneratorOptions(false);
            reset({ charges: [] });
          }
        }}
      >
        <SheetContent className="sm:max-w-[min(96vw,1440px)] p-0 flex flex-col">
          {/* Header del Sheet */}
          <SheetHeader className="bg-[var(--color-bg)]/60 px-6 py-5 border-b border-[var(--color-border)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-3">
                  <SheetTitle className="text-xl sm:text-2xl font-bold text-white">
                    {isEditing
                      ? "Reestructurar Plan Financiero"
                      : "Configurar Nueva Deuda Anual"}
                  </SheetTitle>
                  <Badge
                    variant={
                      selectedStudent && getFinancialSetup(selectedStudent) === "CONFIGURED"
                        ? "success"
                        : "warning"
                    }
                    className="gap-1 text-xs"
                  >
                    {selectedStudent ? STATUS_LABELS[getFinancialSetup(selectedStudent)] : ""}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 text-xs text-[var(--color-text-secondary)] pt-1">
                  <span className="font-semibold text-white text-sm">{selectedStudent?.name}</span>
                  <span>·</span>
                  <span className="font-mono text-blue-300">{selectedStudent?.rut}</span>
                  <span>·</span>
                  <Badge variant="secondary" className="text-[11px]">
                    {selectedStudent?.course?.name ?? "Sin curso"}
                  </Badge>
                  {selectedStudent?.guardian?.name && (
                    <>
                      <span>·</span>
                      <span className="text-[var(--color-text-muted)]">
                        Apoderado: <strong className="text-white">{selectedStudent.guardian.name}</strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </SheetHeader>

          {/* Cuerpo Dividido: Historial de Pagos (Izquierda) + Plan de Cuotas (Derecha) */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden xl:grid-cols-[minmax(420px,0.95fr)_minmax(680px,1.45fr)]">
            {/* Panel Izquierdo: Pagos Históricos y Reasignación */}
            <section className="min-h-0 overflow-y-auto border-b border-[var(--color-border)] p-5 xl:border-r xl:border-b-0 xl:p-6 bg-[var(--color-bg)]/20">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-400" />
                    Pagos Registrados ({paymentHistory.length})
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    Asocia cada pago histórico a su cuota correspondiente o déjalo como saldo libre.
                  </p>
                </div>
              </div>

              {sheetLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
                  <span className="text-xs text-[var(--color-text-muted)]">Cargando pagos...</span>
                </div>
              ) : paymentHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center text-xs text-[var(--color-text-muted)] space-y-2">
                  <CreditCard className="w-8 h-8 mx-auto text-[var(--color-text-muted)]/50" />
                  <p className="font-medium text-white">Sin pagos previos registrados</p>
                  <p>Al guardar las cuotas, el apoderado podrá pagar a través del portal o caja.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentHistory.map((payment) => {
                    const currentAssigned = paymentAssignments[payment.id] ?? "";
                    const isAssigned = Boolean(currentAssigned);

                    return (
                      <div
                        key={payment.id}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isAssigned
                            ? "bg-[var(--color-bg)]/60 border-[var(--color-border)]"
                            : "bg-emerald-500/10 border-emerald-500/30"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">
                              {formatDate(payment.paymentDate)}
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--color-surface)] text-blue-300 font-medium">
                              {payment.concept?.name ?? "Pago"}
                            </span>
                          </div>
                          <span className="text-sm font-bold font-mono text-emerald-300">
                            {formatCurrency(payment.amount)}
                          </span>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1 uppercase tracking-wider">
                            Imputar a Cuota:
                          </label>
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
                              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-white outline-none transition-colors focus:border-[var(--color-primary)] disabled:opacity-60"
                            >
                              <option value="">✨ Saldo Libre / A Favor (Sin asignar)</option>
                              {fields.map((field, chargeIndex) => {
                                const watchedCharge = watchedCharges?.[chargeIndex];
                                const conceptId = Number(
                                  watchedCharge?.conceptId ?? field.conceptId,
                                );
                                const conceptName =
                                  concepts.find((c) => c.id === conceptId)?.name ?? "Cuota";
                                const amount = Number(
                                  watchedCharge?.amount ?? field.amount ?? 0,
                                );
                                const dueDate = watchedCharge?.dueDate ?? field.dueDate;

                                return (
                                  <option
                                    key={field.fieldId}
                                    value={
                                      field.id
                                        ? `id:${field.id}`
                                        : `field:${field.fieldId}`
                                    }
                                  >
                                    Cuota #{chargeIndex + 1} ({formatDateInput(dueDate)}) · {conceptName} · {formatCurrency(amount)}
                                  </option>
                                );
                              })}
                            </select>
                          </NativeSelectField>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Panel Derecho: Generador y Editor de Cuotas */}
            <section className="min-h-0 overflow-y-auto p-5 xl:p-6 space-y-5">
              {/* Tarjetas de Resumen Financiero en Vivo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="glass rounded-xl p-3.5 border border-emerald-500/30 bg-emerald-500/10">
                  <span className="text-[11px] font-medium text-emerald-200/80 uppercase tracking-wider block">
                    Deuda Proyectada:
                  </span>
                  <span className="text-xl font-bold font-mono tabular-nums text-emerald-300 mt-1 block truncate">
                    {formatCurrency(projectedAnnualDebt)}
                  </span>
                </div>

                <div className="glass rounded-xl p-3.5 border border-blue-500/30 bg-blue-500/10">
                  <span className="text-[11px] font-medium text-blue-200/80 uppercase tracking-wider block">
                    Total Ya Abonado:
                  </span>
                  <span className="text-xl font-bold font-mono tabular-nums text-blue-300 mt-1 block truncate">
                    {formatCurrency(totalPaidInCharges)}
                  </span>
                </div>

                <div className="glass rounded-xl p-3.5 border border-[var(--color-border)] bg-[var(--color-bg)]/40">
                  <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider block">
                    Saldo Restante:
                  </span>
                  <span className="text-xl font-bold font-mono tabular-nums text-amber-300 mt-1 block truncate">
                    {formatCurrency(pendingDebtBalance)}
                  </span>
                </div>
              </div>

              {/* Bloque Generador Escolar Inteligente */}
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                      <Wand2 className="w-4 h-4 text-amber-400" />
                      Generador de Cuotas Anuales
                    </h3>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      Crea automáticamente las cuotas de matrícula y colegiatura del año.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowGeneratorOptions(!showGeneratorOptions)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text-secondary)] hover:text-white transition-all"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>{showGeneratorOptions ? "Ocultar Parámetros" : "Ajustar Parámetros"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={generatePlan}
                      disabled={sheetLoading || concepts.length === 0}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>Cargar Plan Estándar</span>
                    </button>
                  </div>
                </div>

                {/* Parámetros Expandibles del Generador */}
                {showGeneratorOptions && (
                  <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] grid grid-cols-1 sm:grid-cols-4 gap-3.5 animate-fade-in text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                        Monto Matrícula ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={genEnrollmentAmount}
                        onChange={(e) => setGenEnrollmentAmount(Number(e.target.value))}
                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-white font-mono text-xs outline-none focus:border-[var(--color-primary)]"
                      />
                      <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={genIncludeEnrollment}
                          onChange={(e) => setGenIncludeEnrollment(e.target.checked)}
                          className="rounded border-[var(--color-border)]"
                        />
                        <span>Incluir Matrícula</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                        Monto Mensualidad ($)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={genMonthlyAmount}
                        onChange={(e) => setGenMonthlyAmount(Number(e.target.value))}
                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-white font-mono text-xs outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                        Cantidad de Cuotas
                      </label>
                      <NativeSelectField>
                        <select
                          value={genMonthsCount}
                          onChange={(e) => setGenMonthsCount(Number(e.target.value))}
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-white text-xs outline-none focus:border-[var(--color-primary)]"
                        >
                          <option value={10}>10 cuotas (Mar a Dic)</option>
                          <option value={11}>11 cuotas (Feb a Dic)</option>
                          <option value={12}>12 cuotas (Ene a Dic)</option>
                          <option value={9}>9 cuotas (Mar a Nov)</option>
                          <option value={5}>5 cuotas semestrales</option>
                        </select>
                      </NativeSelectField>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--color-text-muted)] uppercase mb-1">
                        Día de Vencimiento
                      </label>
                      <NativeSelectField>
                        <select
                          value={genDueDay}
                          onChange={(e) => setGenDueDay(Number(e.target.value))}
                          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-white text-xs outline-none focus:border-[var(--color-primary)]"
                        >
                          <option value={5}>Día 05 de cada mes</option>
                          <option value={10}>Día 10 de cada mes</option>
                          <option value={15}>Día 15 de cada mes</option>
                          <option value={20}>Día 20 de cada mes</option>
                          <option value={28}>Día 28 de cada mes</option>
                        </select>
                      </NativeSelectField>
                    </div>
                  </div>
                )}
              </div>

              {/* Formulario Principal de Cuotas */}
              <form onSubmit={handleSubmit(submitFinancialPlan)} className="space-y-4">
                {fields.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--color-border)] p-10 text-center text-xs text-[var(--color-text-muted)] space-y-2">
                    <Wand2 className="w-8 h-8 mx-auto text-[var(--color-text-muted)]/50" />
                    <p className="font-medium text-white">No hay cuotas configuradas aún</p>
                    <p>Usa el botón &quot;Cargar Plan Estándar&quot; arriba o agrega cuotas manualmente.</p>
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

                      return (
                        <div
                          key={field.fieldId}
                          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/45 p-3.5 space-y-2.5 transition-all hover:border-[var(--color-border)]/90"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-[var(--color-surface)] px-2 text-xs font-bold text-[var(--color-text-secondary)] font-mono">
                                #{index + 1}
                              </span>
                              {isPaid ? (
                                <Badge className="bg-emerald-500/15 border-emerald-500/30 text-emerald-300 gap-1 text-[11px]">
                                  <CheckCircle2 className="w-3 h-3" /> Pagada
                                </Badge>
                              ) : hasPayments ? (
                                <Badge className="bg-blue-500/15 border-blue-500/30 text-blue-300 gap-1 text-[11px]">
                                  <Sparkles className="w-3 h-3" /> Abonada
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[11px]">
                                  Pendiente
                                </Badge>
                              )}
                            </div>
                            {paidAmount > 0 && (
                              <p className="text-xs font-semibold font-mono text-emerald-300">
                                Abonado: {formatCurrency(paidAmount)} / {formatCurrency(amount)}
                              </p>
                            )}
                          </div>

                          <div className="grid gap-3 sm:grid-cols-[minmax(200px,1.2fr)_minmax(140px,0.8fr)_minmax(140px,0.8fr)_auto]">
                            {/* Concepto */}
                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                                Concepto
                              </label>
                              <NativeSelectField>
                                <select
                                  {...register(`charges.${index}.conceptId`, {
                                    valueAsNumber: true,
                                  })}
                                  disabled={isPaid}
                                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-primary)] disabled:opacity-70"
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

                            {/* Vencimiento */}
                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                                Vencimiento
                              </label>
                              <input
                                type="date"
                                {...register(`charges.${index}.dueDate`)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-primary)]"
                              />
                            </div>

                            {/* Monto */}
                            <div>
                              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                                Monto ($)
                              </label>
                              <input
                                type="number"
                                min={paidAmount || 1}
                                step={100}
                                {...register(`charges.${index}.amount`, {
                                  valueAsNumber: true,
                                })}
                                disabled={isPaid}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-semibold font-mono tabular-nums text-white text-right outline-none focus:border-[var(--color-primary)] disabled:opacity-70"
                              />
                            </div>

                            {/* Acciones de Cuota */}
                            <div className="flex items-end justify-end gap-1.5">
                              {/* Botón Pagar Rápido */}
                              {!isPaid && field.id && (
                                <button
                                  type="button"
                                  onClick={() => openQuickPaymentDialog(index)}
                                  className="inline-flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
                                  title="Crear pago rápido por el saldo de esta cuota"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Pagar</span>
                                </button>
                              )}

                              {/* Botón Eliminar Cuota */}
                              {!isPaid ? (
                                <button
                                  type="button"
                                  onClick={() => remove(index)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                                  title="Eliminar cuota"
                                  aria-label="Eliminar cuota"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : (
                                <div
                                  className="inline-flex h-9 w-9 items-center justify-center text-slate-500"
                                  title="Cuota pagada (no se puede eliminar)"
                                >
                                  <Lock className="h-3.5 w-3.5" />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Barra de Acciones del Formulario */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-[var(--color-border)]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        append({
                          conceptId: concepts[0]?.id,
                          amount: concepts[0]?.defaultAmount || 45000,
                          dueDate: buildDueDate(new Date().getFullYear(), fields.length + 2),
                          status: "PENDING",
                          paidAmount: 0,
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--color-surface-hover)] transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Añadir Cuota</span>
                    </button>

                    {fields.length > 0 && (
                      <button
                        type="button"
                        onClick={removeUnpaidCharges}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 px-3 py-2 text-xs font-medium transition-colors"
                        title="Eliminar todas las cuotas que aún no tienen pagos"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Limpiar Sin Pagos</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedStudent(null)}
                      className="px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-white transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || fields.length === 0}
                      className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-600/35 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting
                        ? "Guardando..."
                        : isEditing
                          ? "💾 Guardar Reestructuración"
                          : "✨ Crear Setup Financiero"}
                    </button>
                  </div>
                </div>
              </form>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal de Pago Rápido para una cuota */}
      <Dialog
        open={quickPaymentIndex != null}
        onOpenChange={(open) => {
          if (!open && !quickPaymentSubmitting) closeQuickPaymentDialog();
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white">
              Crear Pago Rápido de Cuota
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--color-text-secondary)]">
              Se registrará un pago por el saldo pendiente y la transacción quedará reflejada en la contabilidad y ficha del alumno.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-200">
              Monto a Registrar
            </p>
            <p className="mt-1 text-2xl font-bold font-mono text-emerald-300">
              {formatCurrency(quickPaymentAmount)}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Fecha de Pago
              </label>
              <input
                type="date"
                value={quickPaymentDate}
                onChange={(event) => setQuickPaymentDate(event.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Método de Pago
              </label>
              <NativeSelectField>
                <select
                  value={quickPaymentMethod}
                  onChange={(event) =>
                    setQuickPaymentMethod(event.target.value as PaymentMethod)
                  }
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-primary)]"
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
              Observaciones / Referencia
            </label>
            <textarea
              value={quickPaymentNotes}
              onChange={(event) => setQuickPaymentNotes(event.target.value)}
              rows={2}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-white outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <DialogFooter className="mt-2">
            <button
              type="button"
              onClick={closeQuickPaymentDialog}
              disabled={quickPaymentSubmitting}
              className="px-4 py-2 text-xs text-[var(--color-text-secondary)] hover:text-white transition-colors disabled:opacity-50"
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
              className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-all disabled:opacity-50"
            >
              {quickPaymentSubmitting ? "Registrando..." : "Registrar Pago"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
