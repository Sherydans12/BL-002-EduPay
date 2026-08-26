"use client";

import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import Link from "next/link";
import {
  paymentsApi,
  reportsApi,
  downloadBlob,
  resolveUploadUrl,
} from "@/lib/api";
import { fetchAllCourses, fetchAllStudents } from "@/lib/fetch-all-pages";
import type {
  Payment,
  Course,
  Student,
  CourseSummary,
  ReportSummary,
  SchoolFeeMatrixResponse,
  FeeQuotaItem,
  StudentMatrixItem,
  CourseMatrixGroup,
} from "@/lib/api";
import { toast } from "sonner";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  Loader2,
  Calendar,
  Layers,
  BarChart3,
  Receipt,
  Users,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Filter,
  Maximize2,
  Minimize2,
  CreditCard,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import { Button } from "@/components/ui/button";
import { formatPaymentDate } from "@/lib/format-payment-date";
import { METHOD_LABELS } from "@/lib/payment-method-labels";
import {
  getPaymentBoletaFileUrl,
  getPaymentBoletaNumber,
} from "@/lib/payment-group-utils";
import { PaymentDetailDialog } from "@/components/payment-detail-dialog";
import { formatCLP, formatNumberCLP } from "@/lib/currency-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

const MONTH_KEYS: {
  key: keyof Pick<
    StudentMatrixItem,
    | "matricula"
    | "marzo"
    | "abril"
    | "mayo"
    | "junio"
    | "julio"
    | "agosto"
    | "septiembre"
    | "octubre"
    | "noviembre"
    | "diciembre"
  >;
  label: string;
  shortLabel: string;
}[] = [
  { key: "matricula", label: "Matrícula", shortLabel: "Matr." },
  { key: "marzo", label: "Marzo", shortLabel: "Mar" },
  { key: "abril", label: "Abril", shortLabel: "Abr" },
  { key: "mayo", label: "Mayo", shortLabel: "May" },
  { key: "junio", label: "Junio", shortLabel: "Jun" },
  { key: "julio", label: "Julio", shortLabel: "Jul" },
  { key: "agosto", label: "Agosto", shortLabel: "Ago" },
  { key: "septiembre", label: "Septiembre", shortLabel: "Sep" },
  { key: "octubre", label: "Octubre", shortLabel: "Oct" },
  { key: "noviembre", label: "Noviembre", shortLabel: "Nov" },
  { key: "diciembre", label: "Diciembre", shortLabel: "Dic" },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"matrix" | "table" | "summary">(
    "matrix",
  );

  // General references
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  // Sábana / Matriz state
  const [matrixData, setMatrixData] = useState<SchoolFeeMatrixResponse | null>(
    null,
  );
  const [matrixCourseId, setMatrixCourseId] = useState<string>("");
  const [matrixYear, setMatrixYear] = useState<number>(new Date().getFullYear());
  const [matrixSearch, setMatrixSearch] = useState<string>("");
  const [matrixStatusFilter, setMatrixStatusFilter] = useState<string>("ALL");
  const [loadingMatrix, setLoadingMatrix] = useState<boolean>(true);

  // Collapsed / Expanded state of courses
  const [expandedCourses, setExpandedCourses] = useState<Set<number>>(new Set());

  // Table payments state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [courseSummary, setCourseSummary] = useState<CourseSummary[]>([]);
  const [globalSummary, setGlobalSummary] = useState<ReportSummary | null>(null);
  const [totalMeta, setTotalMeta] = useState({
    total: 0,
    page: 1,
    totalPages: 1,
  });

  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    courseId: "",
    studentId: "",
  });
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: "",
    dateTo: "",
    courseId: "",
    studentId: "",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [loadingTable, setLoadingTable] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [paymentDetail, setPaymentDetail] = useState<Payment | null>(null);

  useEffect(() => {
    fetchAllCourses().then(setCourses).catch(() => {});
    fetchAllStudents().then(setStudents).catch(() => {});
  }, []);

  // Fetch Matrix from Backend
  const fetchMatrix = useCallback(async () => {
    setLoadingMatrix(true);
    try {
      const data = await reportsApi.getMatrix({
        year: matrixYear,
        courseId: matrixCourseId ? Number(matrixCourseId) : undefined,
        status: matrixStatusFilter !== "ALL" ? matrixStatusFilter : undefined,
        search: matrixSearch.trim() || undefined,
      });
      setMatrixData(data);

      // Default expand all courses if only 1 or 2 courses exist, or if courseId is selected
      if (matrixCourseId || data.courses.length <= 2) {
        setExpandedCourses(new Set(data.courses.map((c) => c.courseId)));
      } else {
        // Expand first course by default for clean initial view
        if (data.courses.length > 0) {
          setExpandedCourses(new Set([data.courses[0].courseId]));
        }
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al cargar la matriz de cuotas",
      );
    } finally {
      setLoadingMatrix(false);
    }
  }, [matrixYear, matrixCourseId, matrixStatusFilter, matrixSearch]);

  useEffect(() => {
    if (activeTab === "matrix") {
      void fetchMatrix();
    }
  }, [activeTab, fetchMatrix]);

  // Expand / Collapse all courses helpers
  const handleExpandAll = () => {
    if (!matrixData) return;
    setExpandedCourses(new Set(matrixData.courses.map((c) => c.courseId)));
  };

  const handleCollapseAll = () => {
    setExpandedCourses(new Set());
  };

  const toggleCourseExpand = (courseId: number) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  // Fetch Payments Table & Summaries
  const fetchTableData = useCallback(async () => {
    setLoadingTable(true);
    try {
      const params: Record<string, string> = {
        page: page.toString(),
        limit: pageSize.toString(),
      };
      if (appliedFilters.dateFrom) params.dateFrom = appliedFilters.dateFrom;
      if (appliedFilters.dateTo) params.dateTo = appliedFilters.dateTo;
      if (appliedFilters.courseId) params.courseId = appliedFilters.courseId;
      if (appliedFilters.studentId) params.studentId = appliedFilters.studentId;

      const [payRes, sumRes, globRes] = await Promise.all([
        paymentsApi.getAll(params),
        paymentsApi.summaryByCourse(
          appliedFilters.dateFrom,
          appliedFilters.dateTo,
        ),
        reportsApi.getSummary(
          appliedFilters.dateFrom,
          appliedFilters.dateTo,
          appliedFilters.courseId,
        ),
      ]);

      setPayments(payRes.data);
      setTotalMeta({
        total: payRes.meta.total,
        page: payRes.meta.page,
        totalPages: payRes.meta.totalPages ?? payRes.meta.lastPage ?? 1,
      });
      setCourseSummary(sumRes);
      setGlobalSummary(globRes);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al cargar reportes de pagos",
      );
    } finally {
      setLoadingTable(false);
    }
  }, [appliedFilters, page, pageSize]);

  useEffect(() => {
    if (activeTab === "table" || activeTab === "summary") {
      void fetchTableData();
    }
  }, [activeTab, fetchTableData]);

  const handleApplyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
  };

  const handleClearFilters = () => {
    const empty = { dateFrom: "", dateTo: "", courseId: "", studentId: "" };
    setFilters(empty);
    setAppliedFilters(empty);
    setPage(1);
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    const toastId = toast.loading("Generando archivo Excel con sábana contable...");
    try {
      const blob = await reportsApi.export({
        dateFrom: appliedFilters.dateFrom || undefined,
        dateTo: appliedFilters.dateTo || undefined,
        courseId:
          activeTab === "matrix"
            ? matrixCourseId || undefined
            : appliedFilters.courseId || undefined,
        studentId: appliedFilters.studentId || undefined,
        year: matrixYear,
      });
      const dateStr = new Date().toISOString().split("T")[0];
      downloadBlob(blob, `Reporte_Sabana_Cobranzas_${dateStr}.xlsx`);
      toast.success("Descarga completada con éxito", { id: toastId });
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al exportar a Excel",
        { id: toastId },
      );
    } finally {
      setIsExporting(false);
    }
  };

  const grandTotal = useMemo(
    () => payments.reduce((sum, p) => sum + p.amount, 0),
    [payments],
  );

  const pieData = useMemo(() => {
    return (
      globalSummary?.byMethod.map((m) => ({
        name: METHOD_LABELS[m.method] || m.method,
        value: m.total,
      })) || []
    );
  }, [globalSummary]);

  // Quota cell renderer helper
  const renderQuotaCell = (q: FeeQuotaItem, monthLabel: string) => {
    if (q.status === "PAID") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex cursor-default items-center justify-center rounded-md bg-emerald-500/15 px-1.5 py-1 font-mono text-[11px] font-bold text-emerald-300">
              {formatNumberCLP(q.paidAmount)}
            </div>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            <p className="font-semibold text-emerald-400">
              {monthLabel}: Pagado
            </p>
            <p className="text-[11px] text-white">
              Total: {formatCLP(q.paidAmount)}
            </p>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (q.status === "OVERDUE") {
      const debt = q.amount - q.paidAmount;
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex cursor-default items-center justify-center rounded-md bg-red-500/20 px-1.5 py-1 font-mono text-[11px] font-bold text-red-300">
              {formatNumberCLP(debt)}
            </div>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            <p className="font-semibold text-red-400">
              {monthLabel}: Cuota Vencida
            </p>
            <p className="text-[11px] text-white">Deuda: {formatCLP(debt)}</p>
            {q.dueDate && (
              <p className="text-[10px] text-red-200">
                Venció: {new Date(q.dueDate).toLocaleDateString("es-CL")}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    if (q.status === "PARTIAL") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex cursor-default items-center justify-center rounded-md bg-amber-500/20 px-1.5 py-1 font-mono text-[10px] font-semibold text-amber-300">
              {formatNumberCLP(q.paidAmount)} / {formatNumberCLP(q.amount)}
            </div>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            <p className="font-semibold text-amber-400">
              {monthLabel}: Abono Parcial
            </p>
            <p className="text-[11px] text-white">
              Abonado: {formatCLP(q.paidAmount)} de {formatCLP(q.amount)}
            </p>
            <p className="text-[10px] text-amber-200">
              Resta: {formatCLP(q.amount - q.paidAmount)}
            </p>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (q.status === "PENDING") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex cursor-default items-center justify-center rounded-md bg-[var(--color-surface)] px-1.5 py-1 font-mono text-[11px] text-[var(--color-text-muted)]">
              {formatNumberCLP(q.amount)}
            </div>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            <p className="font-semibold text-white">
              {monthLabel}: Por Vencer
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Monto: {formatCLP(q.amount)}
            </p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <span className="text-center font-mono text-xs text-[var(--color-text-muted)]/40">
        —
      </span>
    );
  };

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-fade-in">
        {/* Header Superior */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <BarChart3 className="size-5" />
              </span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  Reportes & Sábana de Cobranzas
                </h1>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Control escolar anual de pagos, morosidad por cuotas y análisis contable optimizado
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleExportExcel}
              disabled={isExporting}
              size="lg"
              className="rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500"
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Generando Sábana Excel...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-2 size-4" />
                  Exportar a Excel (Multi-Hoja)
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Pestañas de Navegación */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
          <div className="flex gap-1.5 rounded-xl bg-[var(--color-surface)] p-1">
            <button
              type="button"
              onClick={() => setActiveTab("matrix")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                activeTab === "matrix"
                  ? "bg-[var(--color-primary)] text-white shadow-md"
                  : "text-[var(--color-text-muted)] hover:text-white"
              }`}
            >
              <Layers className="size-3.5" />
              Sábana de Cuotas por Curso (Matriz)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("table")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                activeTab === "table"
                  ? "bg-[var(--color-primary)] text-white shadow-md"
                  : "text-[var(--color-text-muted)] hover:text-white"
              }`}
            >
              <Receipt className="size-3.5" />
              Historial de Pagos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("summary")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                activeTab === "summary"
                  ? "bg-[var(--color-primary)] text-white shadow-md"
                  : "text-[var(--color-text-muted)] hover:text-white"
              }`}
            >
              <TrendingUp className="size-3.5" />
              Resumen Analítico
            </button>
          </div>

          <div className="hidden text-xs text-[var(--color-text-muted)] sm:block">
            {activeTab === "matrix" && matrixData && (
              <span>
                {matrixData.totalStudents} alumnos &bull; {matrixData.courses.length} cursos &bull; Tasa de Cobro: {matrixData.collectionRate}%
              </span>
            )}
          </div>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* PESTAÑA 1: SÁBANA / MATRIZ DE CUOTAS POR CURSO (ESCALABLE)            */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === "matrix" && (
          <div className="space-y-6 animate-fade-in">
            {/* KPIs Consolidados de la Matriz */}
            {matrixData && (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
                  <span className="text-xs font-medium text-[var(--color-text-muted)]">
                    Total Facturado Anual
                  </span>
                  <p className="mt-2 font-mono text-2xl font-bold text-white">
                    {formatCLP(matrixData.totalInvoiced)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                    Compromiso escolar año {matrixYear}
                  </p>
                </div>

                <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
                  <span className="text-xs font-medium text-emerald-300">
                    Total Recaudado en Caja
                  </span>
                  <p className="mt-2 font-mono text-2xl font-bold text-emerald-400">
                    {formatCLP(matrixData.totalPaid)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg)]">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${matrixData.collectionRate}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-emerald-300">
                      {matrixData.collectionRate}%
                    </span>
                  </div>
                </div>

                <div className="glass rounded-2xl border border-red-500/30 bg-red-500/5 p-4 shadow-sm">
                  <span className="text-xs font-medium text-red-300">
                    Deuda Pendiente / Morosidad
                  </span>
                  <p className="mt-2 font-mono text-2xl font-bold text-red-400">
                    {formatCLP(matrixData.totalPending)}
                  </p>
                  <p className="mt-1 text-[11px] text-red-300/80">
                    {matrixData.totalMorosos} alumno(s) con morosidad
                  </p>
                </div>

                <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
                  <span className="text-xs font-medium text-[var(--color-text-muted)]">
                    Alumnos Matriculados
                  </span>
                  <p className="mt-2 text-2xl font-bold text-blue-400">
                    {matrixData.totalStudents}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                    {matrixData.totalAlDia} al día &bull; {matrixData.totalSaldoAFavor} a favor
                  </p>
                </div>
              </div>
            )}

            {/* Barra de Filtros & Búsqueda para la Sábana */}
            <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-md space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_200px_160px_170px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    type="text"
                    value={matrixSearch}
                    onChange={(e) => setMatrixSearch(e.target.value)}
                    placeholder="Buscar alumno, RUT o apoderado..."
                    className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] pl-9 pr-3 text-xs text-white placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] outline-none"
                  />
                </div>

                <NativeSelectField>
                  <select
                    value={matrixCourseId}
                    onChange={(e) => setMatrixCourseId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-white outline-none"
                  >
                    <option value="">Todos los cursos</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </NativeSelectField>

                <NativeSelectField>
                  <select
                    value={matrixYear}
                    onChange={(e) => setMatrixYear(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-white outline-none"
                  >
                    <option value={2026}>Año Escolar 2026</option>
                    <option value={2025}>Año Escolar 2025</option>
                    <option value={2027}>Año Escolar 2027</option>
                  </select>
                </NativeSelectField>

                <NativeSelectField>
                  <select
                    value={matrixStatusFilter}
                    onChange={(e) => setMatrixStatusFilter(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-white outline-none"
                  >
                    <option value="ALL">Todos los estados</option>
                    <option value="OVERDUE">Solo Morosos (Deuda)</option>
                    <option value="AL_DIA">Solo Al Día</option>
                    <option value="SALDO_A_FAVOR">Solo Saldo a Favor</option>
                  </select>
                </NativeSelectField>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={fetchMatrix}
                    disabled={loadingMatrix}
                    variant="outline"
                    className="h-10 rounded-xl border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-xs font-semibold text-white hover:bg-[var(--color-surface-hover)] shadow-sm"
                  >
                    {loadingMatrix && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    Actualizar
                  </Button>
                </div>
              </div>

              {/* Barra de Controles de Acordeón y Leyenda */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-border)]/60 pt-3 text-[11px]">
                {/* Controles de expansión masiva */}
                <div className="flex items-center gap-2">
                  <span className="text-[var(--color-text-muted)] font-medium">
                    Vista por Cursos ({matrixData?.courses.length ?? 0}):
                  </span>
                  <button
                    type="button"
                    onClick={handleExpandAll}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 font-semibold text-white hover:bg-[var(--color-surface-hover)]"
                  >
                    <Maximize2 className="size-3" />
                    Expandir Todos
                  </button>
                  <button
                    type="button"
                    onClick={handleCollapseAll}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 font-semibold text-[var(--color-text-secondary)] hover:text-white"
                  >
                    <Minimize2 className="size-3" />
                    Colapsar Todos
                  </button>
                </div>

                {/* Leyenda de colores */}
                <div className="flex flex-wrap items-center gap-3.5 text-[var(--color-text-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    Pagada
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-red-500" />
                    Vencida
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-amber-500" />
                    Abono Parcial
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full bg-gray-500" />
                    Por Vencer
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="text-[var(--color-text-muted)]/50">—</span>
                    Sin cuota
                  </span>
                </div>
              </div>
            </div>

            {/* Listado Escalable por Acordeones de Curso */}
            {loadingMatrix ? (
              <div className="glass flex items-center justify-center rounded-2xl border border-[var(--color-border)] py-28 shadow-xl">
                <div className="flex flex-col items-center gap-3 text-[var(--color-text-muted)]">
                  <Loader2 className="size-8 animate-spin text-[var(--color-primary)]" />
                  <p className="text-xs">Cargando matriz escolar...</p>
                </div>
              </div>
            ) : !matrixData || matrixData.courses.length === 0 ? (
              <div className="glass rounded-2xl border border-[var(--color-border)] py-20 text-center text-[var(--color-text-muted)] shadow-xl">
                <Layers className="mx-auto size-10 text-[var(--color-text-muted)]/40" />
                <p className="mt-3 text-sm font-semibold text-white">
                  No se encontraron alumnos para los filtros seleccionados
                </p>
                <p className="mt-1 text-xs">
                  Prueba cambiando el curso, estado o término de búsqueda
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {matrixData.courses.map((courseGroup) => {
                  const isExpanded = expandedCourses.has(courseGroup.courseId);

                  return (
                    <div
                      key={`course-card-${courseGroup.courseId}`}
                      className="glass overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-lg transition-all"
                    >
                      {/* Course Summary Card Header (Click to Expand/Collapse) */}
                      <button
                        type="button"
                        onClick={() => toggleCourseExpand(courseGroup.courseId)}
                        className="flex w-full items-center justify-between p-4.5 text-left transition-colors hover:bg-[var(--color-surface-hover)]/60 focus:outline-none"
                      >
                        <div className="flex flex-wrap items-center gap-3.5">
                          <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
                            <Users className="size-4.5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2.5">
                              <h3 className="text-base font-bold text-white">
                                {courseGroup.courseName}
                              </h3>
                              <Badge className="border-blue-500/30 bg-blue-500/15 text-[11px] text-blue-300">
                                {courseGroup.students.length} alumno(s)
                              </Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                              <span className="text-[var(--color-text-muted)]">
                                Facturado:{" "}
                                <strong className="font-mono text-white">
                                  {formatCLP(courseGroup.subtotalInvoiced)}
                                </strong>
                              </span>
                              <span className="text-emerald-400">
                                Recaudado:{" "}
                                <strong className="font-mono">
                                  {formatCLP(courseGroup.subtotalPaid)}
                                </strong>
                              </span>
                              {courseGroup.subtotalPending > 0 && (
                                <span className="text-red-400">
                                  Deuda:{" "}
                                  <strong className="font-mono">
                                    {formatCLP(courseGroup.subtotalPending)}
                                  </strong>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          {/* Badges de Salud del Curso */}
                          <div className="hidden sm:flex items-center gap-2 text-xs">
                            <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-300">
                              {courseGroup.alDiaCount} al día
                            </span>
                            {courseGroup.morosoCount > 0 && (
                              <span className="rounded-md bg-red-500/20 px-2 py-0.5 font-semibold text-red-300">
                                {courseGroup.morosoCount} moroso(s)
                              </span>
                            )}
                            <span className="font-mono font-bold text-white">
                              {courseGroup.collectionRate}% cobrado
                            </span>
                          </div>

                          <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--color-surface)] text-[var(--color-text-muted)]">
                            {isExpanded ? (
                              <ChevronDown className="size-4 text-white" />
                            ) : (
                              <ChevronRight className="size-4 text-white" />
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Course Table (Rendered only when expanded for high performance) */}
                      {isExpanded && (
                        <div className="border-t border-[var(--color-border)]">
                          {courseGroup.students.length === 0 ? (
                            <div className="p-8 text-center text-xs text-[var(--color-text-muted)]">
                              No hay alumnos en este curso que coincidan con el filtro activo.
                            </div>
                          ) : (
                            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                              <table className="w-full min-w-[1280px] border-collapse text-left text-xs">
                                <thead className="sticky top-0 z-20 bg-[var(--color-bg)] shadow-md">
                                  <tr className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                                    <th className="sticky left-0 z-30 bg-[var(--color-bg)] px-4 py-3 shadow-sm">
                                      Alumno / RUT
                                    </th>
                                    <th className="px-3 py-3">Apoderado</th>
                                    {MONTH_KEYS.map((m) => (
                                      <th
                                        key={m.key}
                                        className="px-2 py-3 text-center whitespace-nowrap"
                                      >
                                        {m.shortLabel}
                                      </th>
                                    ))}
                                    <th className="px-3 py-3 text-right">Facturado</th>
                                    <th className="px-3 py-3 text-right text-emerald-400">
                                      Pagado
                                    </th>
                                    <th className="px-3 py-3 text-right text-red-400">
                                      Pendiente
                                    </th>
                                    <th className="px-3 py-3 text-center">Estado</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--color-border)]">
                                  {courseGroup.students.map((student) => {
                                    const isAlDia =
                                      student.generalStatus === "AL_DIA";
                                    const isSaldoFavor =
                                      student.generalStatus === "SALDO_A_FAVOR";
                                    const isMoroso =
                                      student.generalStatus === "MOROSO";

                                    return (
                                      <tr
                                        key={student.studentId}
                                        className="transition-colors hover:bg-[var(--color-surface-hover)]"
                                      >
                                        {/* Alumno (Sticky col) */}
                                        <td className="sticky left-0 z-10 max-w-[220px] bg-[var(--color-surface)] px-4 py-2.5 shadow-sm">
                                          <Link
                                            href={`/alumnos/${student.studentId}/finanzas`}
                                            className="group inline-flex items-center gap-1 font-medium text-white hover:text-[var(--color-primary)]"
                                            title="Abrir ficha financiera"
                                          >
                                            <span className="truncate">
                                              {student.studentName}
                                            </span>
                                            <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                                          </Link>
                                          {student.studentRut && (
                                            <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
                                              {student.studentRut}
                                            </p>
                                          )}
                                        </td>

                                        {/* Apoderado */}
                                        <td className="max-w-[160px] px-3 py-2.5">
                                          <p className="truncate text-white font-medium">
                                            {student.guardianName}
                                          </p>
                                          {student.guardianPhone && (
                                            <p className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                                              {student.guardianPhone}
                                            </p>
                                          )}
                                        </td>

                                        {/* Cuotas mensuales (11 columnas) */}
                                        {MONTH_KEYS.map((m) => (
                                          <td
                                            key={m.key}
                                            className="px-1.5 py-2 text-center"
                                          >
                                            {renderQuotaCell(
                                              student[m.key],
                                              m.label,
                                            )}
                                          </td>
                                        ))}

                                        {/* Totales por alumno */}
                                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-medium text-[var(--color-text-secondary)]">
                                          {formatCLP(student.totalInvoiced)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-bold text-emerald-400">
                                          {formatCLP(student.totalPaid)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-bold text-red-400">
                                          {student.totalPending > 0
                                            ? formatCLP(student.totalPending)
                                            : "$0"}
                                        </td>

                                        {/* Badge de Estado */}
                                        <td className="whitespace-nowrap px-3 py-2.5 text-center">
                                          {isSaldoFavor ? (
                                            <Badge className="border-emerald-500/40 bg-emerald-500/15 text-[10px] text-emerald-300">
                                              Saldo a Favor
                                            </Badge>
                                          ) : isAlDia ? (
                                            <Badge className="border-teal-500/30 bg-teal-500/15 text-[10px] text-teal-300">
                                              Al Día
                                            </Badge>
                                          ) : isMoroso ? (
                                            <Badge className="border-red-500/30 bg-red-500/15 text-[10px] text-red-300">
                                              Moroso
                                            </Badge>
                                          ) : (
                                            <Badge className="border-gray-500/30 bg-gray-500/15 text-[10px] text-gray-300">
                                              Pendiente
                                            </Badge>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* PESTAÑA 2: HISTORIAL DE PAGOS & TRANSACCIONES (PAGINADA)               */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === "table" && (
          <div className="space-y-6 animate-fade-in">
            {/* Filters Box */}
            <div className="glass rounded-2xl border border-[var(--color-border)] p-6 shadow-md">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                    Fecha Inicio
                  </label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, dateFrom: e.target.value }))
                    }
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--color-primary)] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                    Fecha Fin
                  </label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, dateTo: e.target.value }))
                    }
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--color-primary)] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                    Curso
                  </label>
                  <NativeSelectField>
                    <select
                      value={filters.courseId}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          courseId: e.target.value,
                          studentId: "",
                        }))
                      }
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-white outline-none"
                    >
                      <option value="">Todos los cursos</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </NativeSelectField>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                    Alumno
                  </label>
                  <NativeSelectField>
                    <select
                      value={filters.studentId}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          studentId: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-white outline-none"
                    >
                      <option value="">Todos los alumnos</option>
                      {students
                        .filter(
                          (s) =>
                            !filters.courseId ||
                            s.courseId === Number(filters.courseId),
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </NativeSelectField>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-border)] pt-4">
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-[var(--color-text-muted)]">
                    {totalMeta.total} pagos registrados
                  </span>
                  <span className="font-semibold text-emerald-400">
                    Total visible: {formatCLP(grandTotal)}
                  </span>
                </div>
                <div className="flex gap-2.5">
                  <Button
                    variant="ghost"
                    onClick={handleClearFilters}
                    className="text-xs text-[var(--color-text-secondary)] hover:text-white"
                  >
                    Limpiar
                  </Button>
                  <Button
                    onClick={handleApplyFilters}
                    className="gap-2 rounded-xl bg-[var(--color-primary)] text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)]"
                  >
                    <Search className="size-3.5" />
                    Buscar Pagos
                  </Button>
                </div>
              </div>
            </div>

            {/* Payments Table with Sticky Header & Page Size Selector */}
            <div className="glass overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]/60 text-xs">
                <p className="text-[var(--color-text-muted)]">
                  Haz clic sobre cualquier fila para abrir el detalle completo del pago.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--color-text-muted)]">Mostrar:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-white outline-none"
                  >
                    <option value={10}>10 por página</option>
                    <option value={20}>20 por página</option>
                    <option value={50}>50 por página</option>
                    <option value={100}>100 por página</option>
                  </select>
                </div>
              </div>

              {loadingTable ? (
                <div className="flex items-center justify-center py-20">
                  <div className="size-8 animate-spin rounded-full border-3 border-[var(--color-primary)] border-t-transparent" />
                </div>
              ) : payments.length === 0 ? (
                <div className="py-20 text-center text-[var(--color-text-muted)]">
                  <Receipt className="mx-auto size-10 text-[var(--color-text-muted)]/40" />
                  <p className="mt-3 text-sm font-semibold text-white">
                    No se encontraron pagos
                  </p>
                  <p className="mt-1 text-xs">Prueba ajustando los filtros de fecha o curso</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full min-w-[900px]">
                      <thead className="sticky top-0 z-10 bg-[var(--color-bg)] shadow-sm">
                        <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                          <th className="px-6 py-3.5">Fecha</th>
                          <th className="px-6 py-3.5">Alumno</th>
                          <th className="px-6 py-3.5 whitespace-nowrap">Curso</th>
                          <th className="px-6 py-3.5">Monto</th>
                          <th className="px-6 py-3.5">Método</th>
                          <th className="px-6 py-3.5">Pagador</th>
                          <th className="w-12 px-2 py-3.5" aria-hidden />
                          <th className="px-6 py-3.5">Boleta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)] text-sm">
                        {payments.map((p) => (
                          <tr
                            key={p.id}
                            role="button"
                            tabIndex={0}
                            title="Ver detalle del pago"
                            onClick={() => setPaymentDetail(p)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setPaymentDetail(p);
                              }
                            }}
                            className="group cursor-pointer border-l-2 border-l-transparent transition-all hover:border-l-[var(--color-primary)] hover:bg-[var(--color-surface-hover)]"
                          >
                            <td className="whitespace-nowrap px-6 py-4 text-xs text-[var(--color-text-secondary)]">
                              {formatPaymentDate(p.paymentDate)}
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-xs font-semibold text-white">
                                {p.student.name}
                              </p>
                              {p.student.rut && (
                                <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
                                  {p.student.rut}
                                </p>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-xs text-[var(--color-text-secondary)]">
                              {p.student.course.name}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 font-mono font-bold text-emerald-400">
                              {formatCLP(p.amount)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <Badge className="border-blue-500/30 bg-blue-500/15 text-[11px] text-blue-300">
                                {METHOD_LABELS[p.method] || p.method}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-xs">
                              {p.payerName ? (
                                <div>
                                  <p className="font-medium text-white">
                                    {p.payerName}
                                  </p>
                                  {p.payerRut && (
                                    <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
                                      {p.payerRut}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="italic text-[var(--color-text-muted)]">
                                  Apoderado
                                </span>
                              )}
                            </td>
                            <td
                              className="w-12 px-2 py-4 align-middle"
                              aria-hidden
                            >
                              <ChevronRight className="mx-auto size-4 text-[var(--color-primary)] opacity-0 transition-all group-hover:opacity-100" />
                            </td>
                            <td className="px-6 py-4">
                              {getPaymentBoletaFileUrl(p) ? (
                                <a
                                  href={resolveUploadUrl(
                                    getPaymentBoletaFileUrl(p)!,
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                                >
                                  {getPaymentBoletaNumber(p) || "Ver PDF"}
                                  <ExternalLink className="size-3" />
                                </a>
                              ) : (
                                <span className="text-xs text-[var(--color-text-muted)]">
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalMeta.totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4 text-xs">
                      <span className="text-[var(--color-text-muted)]">
                        Mostrando página {totalMeta.page} de {totalMeta.totalPages} ({totalMeta.total} pagos en total)
                      </span>
                      <div className="flex gap-2">
                        <Button
                          disabled={page <= 1}
                          onClick={() => setPage((p) => p - 1)}
                          variant="outline"
                          size="sm"
                          className="h-8 border-[var(--color-border)] text-white"
                        >
                          ← Anterior
                        </Button>
                        <Button
                          disabled={page >= totalMeta.totalPages}
                          onClick={() => setPage((p) => p + 1)}
                          variant="outline"
                          size="sm"
                          className="h-8 border-[var(--color-border)] text-white"
                        >
                          Siguiente →
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* PESTAÑA 3: RESUMEN ANALÍTICO                                          */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === "summary" && (
          <div className="space-y-6 animate-fade-in">
            {globalSummary ? (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                        Recaudación Total (Filtros Activos)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="font-mono text-3xl font-bold text-emerald-400">
                        {formatCLP(globalSummary.totalCollected)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                        Total Transacciones
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-blue-400">
                        {globalSummary.totalTransactions}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Pie Chart Métodos */}
                  <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-md">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold text-white">
                        Desglose por Métodos de Pago
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                      {pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={95}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {pieData.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={COLORS[index % COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <RechartsTooltip
                              formatter={(value) =>
                                formatCLP(Number(value ?? 0))
                              }
                              contentStyle={{
                                backgroundColor: "#1e293b",
                                borderColor: "#334155",
                                color: "#f1f5f9",
                                borderRadius: "8px",
                              }}
                            />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-[var(--color-text-muted)]">
                          Sin datos de métodos
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Barras Resumen Curso */}
                  <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-md">
                    <CardHeader>
                      <CardTitle className="text-base font-semibold text-white">
                        Recaudación por Curso
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[320px] space-y-4 overflow-y-auto pr-2 text-xs">
                        {courseSummary.length === 0 ? (
                          <div className="py-12 text-center text-[var(--color-text-muted)]">
                            Sin datos de cursos
                          </div>
                        ) : (
                          courseSummary.map((s) => {
                            const maxVal = Math.max(
                              ...courseSummary.map((x) => x.total),
                              1,
                            );
                            const percent = Math.min(
                              (s.total / maxVal) * 100,
                              100,
                            );

                            return (
                              <div key={s.courseId} className="space-y-1.5">
                                <div className="flex justify-between">
                                  <span className="font-medium text-white">
                                    {s.courseName}
                                  </span>
                                  <span className="font-mono font-bold text-emerald-400">
                                    {formatCLP(s.total)}
                                  </span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg)]">
                                  <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <div className="py-20 text-center text-[var(--color-text-muted)]">
                Cargando métricas...
              </div>
            )}
          </div>
        )}

        {/* Modal de Detalle de Pago */}
        <PaymentDetailDialog
          payment={paymentDetail}
          open={paymentDetail != null}
          onOpenChange={(next) => {
            if (!next) setPaymentDetail(null);
          }}
        />
      </div>
    </TooltipProvider>
  );
}
