"use client";

import {
  Fragment,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type FormEvent,
} from "react";
import { paymentsApi, downloadBlob, resolveUploadUrl } from "@/lib/api";
import { fetchAllCourses, fetchAllStudents } from "@/lib/fetch-all-pages";
import type { PaymentGroup, Student, Course, PaymentMethod } from "@/lib/api";
import {
  getGroupBoletaFileUrl,
  getGroupBoletaNumber,
  getGroupPayerLabel,
} from "@/lib/payment-group-utils";
import { cmdkPersonFilter } from "@/lib/flexible-search";
import { formatCLP, formatNumberCLP, parseCLP } from "@/lib/currency-utils";
import { toast } from "sonner";
import {
  Search,
  Download,
  FileText,
  Plus,
  FileSpreadsheet,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  User,
  Users,
  Trash2,
  Pencil,
  Receipt,
  CheckCircle2,
  Calendar,
  Filter,
  DollarSign,
  TrendingUp,
  X,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownChevron,
  NativeSelectField,
} from "@/components/ui/dropdown-chevron";
import { formatPaymentDate } from "@/lib/format-payment-date";
import { METHOD_LABELS } from "@/lib/payment-method-labels";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { PendingBoletasTable } from "@/components/pending-boletas-table";
import {
  PaymentReceiptModal,
  type ReceiptData,
} from "./nuevo/PaymentReceiptModal";

const fieldClass =
  "w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all";

const METHOD_FILTER_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "Efectivo" },
  { value: "TRANSFER", label: "Transferencia" },
  { value: "DEBIT", label: "Débito" },
  { value: "CREDIT", label: "Crédito" },
  { value: "CHECK", label: "Cheque" },
];

function toggleExpandedRow(prev: Set<number>, groupId: number): Set<number> {
  const next = new Set(prev);
  if (next.has(groupId)) next.delete(groupId);
  else next.add(groupId);
  return next;
}

function toDateInputValue(value: string): string {
  return value.includes("T") ? value.split("T")[0] : value.slice(0, 10);
}



export default function PagosMasterPage() {
  const [groups, setGroups] = useState<PaymentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"historial" | "pendientes">("historial");

  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [courseFilter, setCourseFilter] = useState("");
  const [filterMethod, setFilterMethod] = useState<PaymentMethod | "ALL">(
    "ALL",
  );
  const [boletaFilter, setBoletaFilter] = useState<"ALL" | "EMITTED" | "PENDING">("ALL");
  const [studentOpen, setStudentOpen] = useState(false);

  const [filters, setFilters] = useState<{
    dateFrom: string;
    dateTo: string;
    studentId?: number;
    courseId?: number;
    method?: PaymentMethod;
    boletaStatus: "ALL" | "EMITTED" | "PENDING";
  }>({
    dateFrom: "",
    dateTo: "",
    studentId: undefined,
    courseId: undefined,
    method: undefined,
    boletaStatus: "ALL",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [voidingGroup, setVoidingGroup] = useState<PaymentGroup | null>(null);
  const [resolvingGroup, setResolvingGroup] = useState<PaymentGroup | null>(
    null,
  );
  const [boletaNumber, setBoletaNumber] = useState("");
  const [boletaFile, setBoletaFile] = useState<File | null>(null);
  const [editPaymentDate, setEditPaymentDate] = useState("");
  const [editMethod, setEditMethod] = useState<PaymentMethod>("TRANSFER");
  const [editNotes, setEditNotes] = useState("");
  const [isResolvingBoleta, setIsResolvingBoleta] = useState(false);
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);
  const [isVoidingGroup, setIsVoidingGroup] = useState(false);
  const [pendingBoletasTotal, setPendingBoletasTotal] = useState(0);

  // Receipt Modal State for Re-printing any historical receipt
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [selectedReceiptData, setSelectedReceiptData] = useState<ReceiptData | null>(null);

  useEffect(() => {
    fetchAllCourses()
      .then(setCourses)
      .catch(() => {});
    fetchAllStudents()
      .then(setStudents)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (courseFilter) {
      setFilteredStudents(
        students.filter((s) => s.courseId === Number(courseFilter)),
      );
    } else {
      setFilteredStudents(students);
    }
  }, [courseFilter, students]);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: page.toString(),
        limit: "20",
      };
      if (appliedFilters.dateFrom) params.dateFrom = appliedFilters.dateFrom;
      if (appliedFilters.dateTo) params.dateTo = appliedFilters.dateTo;
      if (appliedFilters.studentId != null)
        params.studentId = String(appliedFilters.studentId);
      if (appliedFilters.courseId != null)
        params.courseId = String(appliedFilters.courseId);
      if (appliedFilters.method) params.method = appliedFilters.method;
      if (appliedFilters.boletaStatus === "EMITTED") params.isBoletaPending = "false";
      if (appliedFilters.boletaStatus === "PENDING") params.isBoletaPending = "true";

      const res = await paymentsApi.getGroups(params);
      setGroups(res.data);
      setTotalPages(res.meta.totalPages ?? res.meta.lastPage ?? 1);
      setTotalCount(res.meta.total);
    } catch {
      toast.error("Error al cargar historial de pagos");
    } finally {
      setLoading(false);
    }
  }, [page, appliedFilters]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const handleApplyFilters = () => {
    setAppliedFilters({
      ...filters,
      courseId: courseFilter ? Number(courseFilter) : undefined,
      method: filterMethod === "ALL" ? undefined : filterMethod,
      boletaStatus: boletaFilter,
    });
    setPage(1);
  };

  const handleClearFilters = () => {
    const empty = {
      dateFrom: "",
      dateTo: "",
      studentId: undefined as number | undefined,
      courseId: undefined as number | undefined,
      method: undefined as PaymentMethod | undefined,
      boletaStatus: "ALL" as const,
    };
    setFilters(empty);
    setAppliedFilters(empty);
    setCourseFilter("");
    setFilterMethod("ALL");
    setBoletaFilter("ALL");
    setPage(1);
  };

  const applyDatePreset = (preset: "today" | "week" | "month" | "year" | "all") => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    if (preset === "all") {
      setFilters((f) => ({ ...f, dateFrom: "", dateTo: "" }));
      setAppliedFilters((f) => ({ ...f, dateFrom: "", dateTo: "" }));
      setPage(1);
      return;
    }

    if (preset === "today") {
      setFilters((f) => ({ ...f, dateFrom: todayStr, dateTo: todayStr }));
      setAppliedFilters((f) => ({ ...f, dateFrom: todayStr, dateTo: todayStr }));
      setPage(1);
      return;
    }

    if (preset === "week") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      const mondayStr = monday.toISOString().split("T")[0];
      setFilters((f) => ({ ...f, dateFrom: mondayStr, dateTo: todayStr }));
      setAppliedFilters((f) => ({ ...f, dateFrom: mondayStr, dateTo: todayStr }));
      setPage(1);
      return;
    }

    if (preset === "month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstDayStr = firstDay.toISOString().split("T")[0];
      setFilters((f) => ({ ...f, dateFrom: firstDayStr, dateTo: todayStr }));
      setAppliedFilters((f) => ({ ...f, dateFrom: firstDayStr, dateTo: todayStr }));
      setPage(1);
      return;
    }

    if (preset === "year") {
      const firstDayYear = new Date(now.getFullYear(), 0, 1);
      const firstDayYearStr = firstDayYear.toISOString().split("T")[0];
      setFilters((f) => ({ ...f, dateFrom: firstDayYearStr, dateTo: todayStr }));
      setAppliedFilters((f) => ({ ...f, dateFrom: firstDayYearStr, dateTo: todayStr }));
      setPage(1);
      return;
    }
  };

  const selectedStudent =
    filters.studentId != null
      ? students.find((s) => s.id === filters.studentId)
      : undefined;

  // Compute key statistics for KPI cards
  const stats = useMemo(() => {
    const totalRevenue = groups.reduce((acc, g) => acc + g.totalAmount, 0);
    const pendingInPage = groups.filter((g) => g.isBoletaPending).length;
    const uniqueStudentIds = new Set<number>();
    groups.forEach((g) => {
      g.payments.forEach((p) => {
        if (p.student?.id) uniqueStudentIds.add(p.student.id);
      });
    });

    return {
      pageRevenue: totalRevenue,
      totalTransactions: totalCount,
      pendingCount: pendingBoletasTotal > 0 ? pendingBoletasTotal : pendingInPage,
      uniqueStudentsCount: uniqueStudentIds.size,
    };
  }, [groups, totalCount, pendingBoletasTotal]);

  const handleExportExcel = async () => {
    setIsExporting(true);
    const toastId = toast.loading("Generando Excel...");
    try {
      const params: Record<string, string> = {};
      if (appliedFilters.dateFrom) params.dateFrom = appliedFilters.dateFrom;
      if (appliedFilters.dateTo) params.dateTo = appliedFilters.dateTo;
      if (appliedFilters.studentId != null)
        params.studentId = String(appliedFilters.studentId);
      if (appliedFilters.courseId != null)
        params.courseId = String(appliedFilters.courseId);
      const blob = await paymentsApi.export(params);
      downloadBlob(
        blob,
        `pagos_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      toast.success("Descarga completada", { id: toastId });
    } catch {
      toast.error("Error al exportar", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const confirmVoidGroup = async () => {
    if (!voidingGroup) return;
    setIsVoidingGroup(true);
    try {
      await paymentsApi.deleteGroup(voidingGroup.id);
      toast.success("Transacción anulada exitosamente");
      setVoidingGroup(null);
      await fetchGroups();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al anular transacción",
      );
    } finally {
      setIsVoidingGroup(false);
    }
  };

  const openResolveBoletaDialog = (group: PaymentGroup) => {
    setResolvingGroup(group);
    setBoletaNumber(getGroupBoletaNumber(group) ?? "");
    setBoletaFile(null);
    setEditPaymentDate(toDateInputValue(group.paymentDate));
    setEditMethod(group.method);
    setEditNotes(group.notes ?? "");
  };

  const openReceiptModal = (group: PaymentGroup) => {
    const data: ReceiptData = {
      groupId: group.id,
      paymentDate: group.paymentDate,
      totalAmount: group.totalAmount,
      method: group.method,
      referenceCode: group.buyOrder ?? undefined,
      boletaNumber: getGroupBoletaNumber(group),
      isBoletaPending: group.isBoletaPending,
      payerName: group.payerName ?? undefined,
      guardianName: getGroupPayerLabel(group),
      notes: group.notes ?? undefined,
      items: group.payments.map((p) => ({
        studentName: p.student.name,
        courseName: p.student.course?.name,
        rut: p.student.rut,
        conceptName:
          p.concept?.name ??
          (p.chargeId == null ? "Abono Libre / Saldo a Favor" : "Cuota"),
        amount: p.amount,
      })),
    };
    setSelectedReceiptData(data);
    setReceiptModalOpen(true);
  };

  const handleResolveBoleta = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resolvingGroup) return;

    const trimmedBoletaNumber = boletaNumber.trim();
    if (!editPaymentDate) {
      toast.error("Ingresa la fecha de pago");
      return;
    }

    if (resolvingGroup.isBoletaPending && trimmedBoletaNumber && !boletaFile) {
      toast.error("Adjunta el archivo PDF para resolver la boleta pendiente");
      return;
    }

    setSaveConfirmationOpen(true);
  };

  const confirmGroupUpdate = async () => {
    if (!resolvingGroup) return;

    const trimmedBoletaNumber = boletaNumber.trim();
    const willAttachPendingBoleta =
      resolvingGroup.isBoletaPending && boletaFile != null;
    const fd = new FormData();
    fd.append("method", editMethod);
    fd.append("paymentDate", editPaymentDate);
    fd.append("notes", editNotes);
    fd.append(
      "isBoletaPending",
      willAttachPendingBoleta
        ? "true"
        : trimmedBoletaNumber
          ? "false"
          : String(resolvingGroup.isBoletaPending),
    );
    if (trimmedBoletaNumber) fd.append("boletaNumber", trimmedBoletaNumber);
    if (boletaFile && !willAttachPendingBoleta) {
      fd.append("boleta", boletaFile);
    }

    setIsResolvingBoleta(true);
    try {
      await paymentsApi.updateGroupDetails(resolvingGroup.id, fd);

      if (willAttachPendingBoleta) {
        await paymentsApi.attachBoleta(resolvingGroup.id, {
          boleta: boletaFile,
        });
        toast.success("Boleta adjuntada; el correo al apoderado fue iniciado");
      } else {
        toast.success("Transacción actualizada exitosamente");
      }

      setSaveConfirmationOpen(false);
      setResolvingGroup(null);
      setBoletaNumber("");
      setBoletaFile(null);
      setEditPaymentDate("");
      setEditMethod("TRANSFER");
      setEditNotes("");
      await fetchGroups();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al resolver boleta",
      );
    } finally {
      setIsResolvingBoleta(false);
    }
  };

  const boletaRecipients = useMemo(() => {
    if (!resolvingGroup) return [];

    return Array.from(
      new Set(
        resolvingGroup.payments
          .map((payment) => payment.student.guardian?.email?.trim())
          .filter((email): email is string => Boolean(email)),
      ),
    );
  }, [resolvingGroup]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-16">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <span>Historial de Pagos</span>
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-1">
            Registro consolidado de cobros por caja y portal con desglose multi-alumno y recibos de caja.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs sm:text-sm font-medium transition-all disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isExporting ? "Exportando..." : "Exportar Excel"}</span>
          </button>
          <Link
            href="/pagos/nuevo"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-600/20 hover:shadow-blue-600/35 transition-all hover:scale-[1.02] active:scale-[0.98] text-xs sm:text-sm"
          >
            <Plus className="w-4 h-4" /> Registrar Pago
          </Link>
        </div>
      </div>

      {/* Tarjetas de Estadísticas / KPIs de Caja */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Recaudación Total en Pantalla */}
        <div className="glass rounded-2xl p-4 border border-[var(--color-border)] flex items-center gap-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider truncate">
              Recaudado (Página)
            </p>
            <p className="text-lg sm:text-xl font-bold font-mono text-emerald-300 tracking-tight truncate">
              {formatCLP(stats.pageRevenue)}
            </p>
          </div>
        </div>

        {/* Total Transacciones */}
        <div className="glass rounded-2xl p-4 border border-[var(--color-border)] flex items-center gap-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider truncate">
              Transacciones
            </p>
            <p className="text-lg sm:text-xl font-bold font-mono text-white tracking-tight">
              {stats.totalTransactions} <span className="text-xs font-normal text-[var(--color-text-muted)]">operaciones</span>
            </p>
          </div>
        </div>

        {/* Boletas Pendientes (Clickable para cambiar de tab) */}
        <button
          type="button"
          onClick={() => setActiveTab("pendientes")}
          className={`glass rounded-2xl p-4 border flex items-center gap-3.5 shadow-sm text-left transition-all hover:scale-[1.01] ${
            stats.pendingCount > 0
              ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-400"
              : "border-[var(--color-border)]"
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              stats.pendingCount > 0
                ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider truncate flex items-center gap-1.5">
              <span>Boletas Pendientes</span>
              {stats.pendingCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </p>
            <p
              className={`text-lg sm:text-xl font-bold font-mono tracking-tight ${
                stats.pendingCount > 0 ? "text-amber-300" : "text-white"
              }`}
            >
              {stats.pendingCount}{" "}
              <span className="text-xs font-normal text-[var(--color-text-muted)]">por emitir</span>
            </p>
          </div>
        </button>

        {/* Alumnos Cubiertos */}
        <div className="glass rounded-2xl p-4 border border-[var(--color-border)] flex items-center gap-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <p className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider truncate">
              Alumnos Cubiertos
            </p>
            <p className="text-lg sm:text-xl font-bold font-mono text-white tracking-tight">
              {stats.uniqueStudentsCount}{" "}
              <span className="text-xs font-normal text-[var(--color-text-muted)]">estudiantes</span>
            </p>
          </div>
        </div>
      </div>

      {/* Panel de Filtros Avanzados y Presets */}
      <div className="glass rounded-2xl p-5 space-y-4 border border-[var(--color-border)]">
        {/* Presets Rápidos de Fecha */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Rango Rápido:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => applyDatePreset("today")}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white hover:border-blue-400 transition-all"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset("week")}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white hover:border-blue-400 transition-all"
            >
              Esta Semana
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset("month")}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white hover:border-blue-400 transition-all"
            >
              Este Mes
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset("year")}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white hover:border-blue-400 transition-all"
            >
              Este Año
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset("all")}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-[var(--color-text-muted)] hover:text-white transition-all"
            >
              Todo
            </button>
          </div>
        </div>

        {/* Inputs de Filtro */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Alumno Popover */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
              Alumno
            </label>
            <Popover open={studentOpen} onOpenChange={setStudentOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`${fieldClass} flex items-center gap-2 text-left`}
                >
                  <span
                    className={`min-w-0 flex-1 truncate ${selectedStudent ? "text-white" : "text-[var(--color-text-muted)]"}`}
                  >
                    {selectedStudent
                      ? selectedStudent.name
                      : "Buscar por nombre o RUT..."}
                  </span>
                  <DropdownChevron />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[min(400px,calc(100vw-2rem))] p-0 z-[60]"
                align="start"
              >
                <Command filter={cmdkPersonFilter} className="bg-transparent">
                  <CommandInput placeholder="Buscar por nombre o RUT..." />
                  <CommandList>
                    <CommandEmpty>No se encontró el alumno.</CommandEmpty>
                    <CommandGroup>
                      {filteredStudents.map((s) => (
                        <CommandItem
                          key={s.id}
                          value={`${s.name}\t${s.rut}`}
                          onSelect={() => {
                            setFilters((f) => ({ ...f, studentId: s.id }));
                            setStudentOpen(false);
                          }}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-col">
                            <span>{s.name}</span>
                            <span className="text-xs text-[var(--color-text-muted)]">
                              {s.rut} - {s.course.name}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Curso */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
              Curso
            </label>
            <NativeSelectField>
              <select
                value={courseFilter}
                onChange={(e) => {
                  setCourseFilter(e.target.value);
                  setFilters((f) => ({ ...f, studentId: undefined }));
                }}
                className={fieldClass}
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

          {/* Fecha Inicio */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
              Fecha Inicio
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateFrom: e.target.value }))
              }
              className={fieldClass}
            />
          </div>

          {/* Fecha Fin */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
              Fecha Fin
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters((f) => ({ ...f, dateTo: e.target.value }))
              }
              className={fieldClass}
              onKeyDown={(e) => e.key === "Enter" && handleApplyFilters()}
            />
          </div>

          {/* Método de Pago */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
              Método de Pago
            </label>
            <Select
              value={filterMethod}
              onValueChange={(value) =>
                setFilterMethod(value as PaymentMethod | "ALL")
              }
            >
              <SelectTrigger
                className={`${fieldClass} h-auto min-h-[42px] w-full rounded-xl px-4 py-2.5`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="ALL">Todos los métodos</SelectItem>
                {METHOD_FILTER_OPTIONS.map((method) => (
                  <SelectItem key={method.value} value={method.value}>
                    {method.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Barra Inferior de Filtros */}
        <div className="flex flex-col gap-3 pt-3 border-t border-[var(--color-border)]/70 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-muted)] font-medium">
              {totalCount} transacciones encontradas
            </span>
            {/* Filtro rápido de estado de boleta */}
            <div className="flex items-center gap-1.5 bg-[var(--color-bg)] px-2 py-1 rounded-lg border border-[var(--color-border)]">
              <span className="text-[11px] text-[var(--color-text-muted)]">Boleta:</span>
              <button
                type="button"
                onClick={() => setBoletaFilter("ALL")}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                  boletaFilter === "ALL"
                    ? "bg-blue-600 text-white"
                    : "text-[var(--color-text-secondary)] hover:text-white"
                }`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setBoletaFilter("EMITTED")}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                  boletaFilter === "EMITTED"
                    ? "bg-emerald-600 text-white"
                    : "text-[var(--color-text-secondary)] hover:text-white"
                }`}
              >
                Emitidas
              </button>
              <button
                type="button"
                onClick={() => setBoletaFilter("PENDING")}
                className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                  boletaFilter === "PENDING"
                    ? "bg-amber-600 text-white"
                    : "text-[var(--color-text-secondary)] hover:text-white"
                }`}
              >
                Pendientes
              </button>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={handleClearFilters}
              className="px-3.5 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-white transition-colors"
            >
              Limpiar
            </button>
            <button
              onClick={handleApplyFilters}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs sm:text-sm font-semibold hover:bg-[var(--color-primary-hover)] transition-all shadow-md shadow-blue-600/20"
            >
              <Search className="w-3.5 h-3.5" /> Aplicar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Pestañas: Historial General vs Bandeja de Pendientes */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "historial" | "pendientes")}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="historial">Historial General</TabsTrigger>
          <TabsTrigger value="pendientes">
            Bandeja de Pendientes
            {pendingBoletasTotal > 0 && (
              <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200 border border-amber-500/30">
                {pendingBoletasTotal}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="historial" className="mt-0">
          <div className="glass rounded-2xl overflow-hidden shadow-xl border border-[var(--color-border)]">
            <div className="px-6 py-3 bg-[var(--color-bg)]/40 border-b border-[var(--color-border)]/60 flex items-center justify-between text-xs text-[var(--color-text-muted)]">
              <span>Hacé clic en cualquier fila para expandir el desglose detallado de cuotas y conceptos.</span>
              <span className="text-[11px] font-mono">Página {page} de {totalPages}</span>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-[var(--color-text-muted)]">Cargando transacciones...</span>
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-20 space-y-2 text-[var(--color-text-muted)]">
                <Receipt className="w-8 h-8 mx-auto text-[var(--color-text-muted)]/60" />
                <p className="text-sm font-medium text-white">No se encontraron transacciones</p>
                <p className="text-xs">Prueba ajustando los filtros o fechas de búsqueda</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/60 border-b border-[var(--color-border)]">
                        <th className="w-10 px-4 py-3.5" aria-hidden />
                        <th className="px-4 py-3.5">Transacción / Fecha</th>
                        <th className="px-6 py-3.5">Alumnos</th>
                        <th className="px-6 py-3.5">Pagador</th>
                        <th className="px-6 py-3.5">Monto total</th>
                        <th className="px-6 py-3.5">Método</th>
                        <th className="px-6 py-3.5">Estado Documento</th>
                        <th className="px-6 py-3.5 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((group, i) => {
                        const isExpanded = expandedRows.has(group.id);
                        const boletaUrl = getGroupBoletaFileUrl(group);
                        const boletaNum = getGroupBoletaNumber(group);

                        // Extract distinct students accurately
                        const distinctStudentsMap = new Map<number, { name: string; courseName?: string }>();
                        group.payments.forEach((p) => {
                          if (p.student) {
                            distinctStudentsMap.set(p.student.id, {
                              name: p.student.name,
                              courseName: p.student.course?.name,
                            });
                          }
                        });
                        const distinctStudents = Array.from(distinctStudentsMap.values());
                        const distinctStudentCount = distinctStudents.length;
                        const totalAllocationsCount = group.payments.length;

                        return (
                          <Fragment key={group.id}>
                            <tr
                              role="button"
                              tabIndex={0}
                              aria-expanded={isExpanded}
                              onClick={() =>
                                setExpandedRows((prev) =>
                                  toggleExpandedRow(prev, group.id),
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setExpandedRows((prev) =>
                                    toggleExpandedRow(prev, group.id),
                                  );
                                }
                              }}
                              className="group cursor-pointer border-t border-[var(--color-border)] border-l-2 border-l-transparent transition-all duration-200 hover:border-l-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:border-l-[var(--color-primary)] focus-visible:bg-[var(--color-surface-hover)] animate-fade-in"
                              style={{ animationDelay: `${i * 15}ms` }}
                            >
                              {/* Chevron Expandible */}
                              <td className="px-4 py-4 align-middle">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-[var(--color-primary)]" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]" />
                                )}
                              </td>

                              {/* Transacción / Fecha */}
                              <td className="px-4 py-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-bold font-mono text-white">
                                    #{group.id}
                                  </span>
                                </div>
                                <div className="text-xs text-[var(--color-text-muted)]">
                                  {formatPaymentDate(group.paymentDate)}
                                </div>
                              </td>

                              {/* Alumnos (Cálculo corregido de Alumnos Únicos vs Cuotas) */}
                              <td className="px-6 py-4">
                                {distinctStudentCount === 1 ? (
                                  <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                                      <User className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                      <span className="truncate max-w-[200px]" title={distinctStudents[0].name}>
                                        {distinctStudents[0].name}
                                      </span>
                                    </span>
                                    {totalAllocationsCount > 1 ? (
                                      <span className="text-[11px] text-blue-300/80 pl-5 font-mono">
                                        {totalAllocationsCount} cuotas / abonos
                                      </span>
                                    ) : (
                                      distinctStudents[0].courseName && (
                                        <span className="text-[11px] text-[var(--color-text-muted)] pl-5 truncate max-w-[180px]">
                                          {distinctStudents[0].courseName}
                                        </span>
                                      )
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex flex-col">
                                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                                      <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                      <span>{distinctStudentCount} alumnos</span>
                                    </span>
                                    <span className="text-[11px] text-indigo-300/80 pl-5 font-mono">
                                      {totalAllocationsCount} cuotas totales
                                    </span>
                                  </div>
                                )}
                              </td>

                              {/* Pagador */}
                              <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                                {getGroupPayerLabel(group)}
                              </td>

                              {/* Monto Total */}
                              <td className="px-6 py-4 font-bold font-mono text-emerald-300 text-sm tabular-nums">
                                ${group.totalAmount.toLocaleString("es-CL")}
                              </td>

                              {/* Método */}
                              <td className="px-6 py-4">
                                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--color-primary-light)] text-blue-300 inline-flex items-center gap-1">
                                  {METHOD_LABELS[group.method] || group.method}
                                </span>
                              </td>

                              {/* Estado Documento */}
                              <td className="px-6 py-4">
                                <div className="flex flex-col items-start gap-1">
                                  {group.isBoletaPending ? (
                                    <Badge
                                      variant="destructive"
                                      className="gap-1 bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                      Boleta Pendiente
                                    </Badge>
                                  ) : (
                                    <>
                                      <Badge className="bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 gap-1">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Boleta Emitida
                                      </Badge>
                                      {boletaNum && (
                                        <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
                                          N° {boletaNum}
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>

                              {/* Comprobante y Acciones */}
                              <td className="px-6 py-4">
                                <div className="flex justify-center items-center gap-1.5">
                                  {/* Botón Ver / Imprimir Recibo de Caja Histórico */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openReceiptModal(group);
                                    }}
                                    className="inline-flex items-center justify-center p-2 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/30 transition-colors"
                                    title="Ver / Imprimir Comprobante de Caja"
                                    aria-label={`Ver comprobante #${group.id}`}
                                  >
                                    <Receipt className="w-4 h-4" />
                                  </button>

                                  {/* Botón PDF Boleta SII */}
                                  {boletaUrl && (
                                    <a
                                      href={resolveUploadUrl(boletaUrl)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 transition-colors text-xs font-medium border border-slate-700 hover:border-blue-500/30"
                                      title={
                                        boletaNum
                                          ? `Boleta SII N° ${boletaNum}`
                                          : "Ver PDF de Boleta"
                                      }
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      <span className="hidden xl:inline text-[11px]">PDF</span>
                                    </a>
                                  )}

                                  {/* Botón Editar Transacción */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openResolveBoletaDialog(group);
                                    }}
                                    className="inline-flex items-center justify-center p-2 rounded-lg text-blue-300 hover:text-blue-200 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 transition-colors"
                                    title="Editar transacción contable"
                                    aria-label={`Editar transacción #${group.id}`}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>

                                  {/* Botón Anular Transacción */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setVoidingGroup(group);
                                    }}
                                    className="inline-flex items-center justify-center p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-colors"
                                    title="Anular transacción"
                                    aria-label={`Anular transacción #${group.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Desglose Expandido Enriquecido */}
                            {isExpanded && (
                              <tr
                                key={`${group.id}-detail`}
                                className="bg-[var(--color-bg)]/80 animate-fade-in"
                              >
                                <td colSpan={8} className="px-0 py-0">
                                  <div className="px-8 py-5 border-t border-[var(--color-border)]/60 space-y-3">
                                    <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]/40">
                                      <span className="text-xs font-semibold uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                                        <Receipt className="w-3.5 h-3.5" />
                                        Desglose de Imputaciones Contables
                                      </span>
                                      <span className="text-xs text-[var(--color-text-muted)]">
                                        {group.payments.length} cuota(s) / abono(s) registrados
                                      </span>
                                    </div>

                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-bg)]/40 rounded-lg">
                                          <th className="py-2 px-3 font-semibold">
                                            Alumno
                                          </th>
                                          <th className="py-2 px-3 font-semibold">
                                            Curso
                                          </th>
                                          <th className="py-2 px-3 font-semibold">
                                            Concepto / Tipo
                                          </th>
                                          <th className="py-2 px-3 text-right font-semibold">
                                            Monto Pagado
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-[var(--color-border)]/30">
                                        {group.payments.map((p) => (
                                          <tr key={p.id} className="hover:bg-[var(--color-surface-hover)]/40">
                                            <td className="py-2.5 px-3 text-white font-medium">
                                              <div className="flex flex-col">
                                                <span>{p.student.name}</span>
                                                {p.student.rut && (
                                                  <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                                                    {p.student.rut}
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">
                                              {p.student.course?.name ?? "—"}
                                            </td>
                                            <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">
                                              <div className="flex items-center gap-2">
                                                <span>{p.concept?.name ?? "—"}</span>
                                                {p.chargeId == null ? (
                                                  <span className="text-[10px] bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 px-2 py-0.5 rounded font-medium inline-flex items-center gap-1">
                                                    <Sparkles className="w-2.5 h-2.5" /> Saldo a Favor / Abono
                                                  </span>
                                                ) : null}
                                              </div>
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-bold font-mono text-emerald-300 tabular-nums">
                                              ${p.amount.toLocaleString("es-CL")}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>

                                    {/* Notas / Observaciones Internas si existen */}
                                    {group.notes && (
                                      <div className="mt-3 p-3 rounded-xl bg-[var(--color-bg)]/60 border border-[var(--color-border)]/50 text-xs text-[var(--color-text-secondary)] flex items-start gap-2.5">
                                        <FileText className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                                        <div>
                                          <span className="font-semibold text-white">Notas / Referencia: </span>
                                          <span>{group.notes}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Paginador */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg)]/30">
                    <span className="text-xs sm:text-sm text-[var(--color-text-muted)]">
                      Mostrando página <span className="font-semibold text-white">{page}</span> de{" "}
                      <span className="font-semibold text-white">{totalPages}</span> ({totalCount} resultados)
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="px-3.5 py-1.5 rounded-xl text-xs sm:text-sm border border-[var(--color-border)] text-white hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-all font-medium"
                      >
                        Anterior
                      </button>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-3.5 py-1.5 rounded-xl text-xs sm:text-sm border border-[var(--color-border)] text-white hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-all font-medium"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pendientes" className="mt-0">
          <PendingBoletasTable
            onAttached={fetchGroups}
            onTotalChange={setPendingBoletasTotal}
          />
        </TabsContent>
      </Tabs>

      {/* Modal para Editar Transacción Contable */}
      <Dialog
        open={!!resolvingGroup}
        onOpenChange={(open) => {
          if (open) return;
          setSaveConfirmationOpen(false);
          setResolvingGroup(null);
          setBoletaNumber("");
          setBoletaFile(null);
          setEditPaymentDate("");
          setEditMethod("TRANSFER");
          setEditNotes("");
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white">
              Editar Transacción #{resolvingGroup?.id}
            </DialogTitle>
            <DialogDescription className="text-[var(--color-text-secondary)]">
              Actualiza los datos administrativos del pago. Si no hay boleta, se
              mantiene en la bandeja de pendientes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResolveBoleta} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
                  Fecha de pago
                </label>
                <input
                  type="date"
                  value={editPaymentDate}
                  onChange={(event) => setEditPaymentDate(event.target.value)}
                  className={fieldClass}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
                  Método
                </label>
                <NativeSelectField>
                  <select
                    value={editMethod}
                    onChange={(event) =>
                      setEditMethod(event.target.value as PaymentMethod)
                    }
                    className={fieldClass}
                  >
                    {METHOD_FILTER_OPTIONS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </NativeSelectField>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
                N° de Boleta SII
              </label>
              <input
                type="text"
                value={boletaNumber}
                onChange={(event) => setBoletaNumber(event.target.value)}
                className={fieldClass}
                placeholder="Ej: BOL-00587"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
                Archivo PDF de Boleta
              </label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  setBoletaFile(event.target.files?.[0] ?? null)
                }
                className={`${fieldClass} file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[var(--color-primary-hover)]`}
              />
              <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                Opcional, pero recomendado para dejar respaldo inmediato.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
                Observaciones / Notas
              </label>
              <textarea
                value={editNotes}
                onChange={(event) => setEditNotes(event.target.value)}
                className={fieldClass}
                rows={3}
                placeholder="Notas internas del pago"
              />
            </div>

            <DialogFooter className="mt-6">
              <button
                type="button"
                onClick={() => {
                  setSaveConfirmationOpen(false);
                  setResolvingGroup(null);
                  setBoletaNumber("");
                  setBoletaFile(null);
                  setEditPaymentDate("");
                  setEditMethod("TRANSFER");
                  setEditNotes("");
                }}
                className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isResolvingBoleta}
                className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-semibold hover:bg-[var(--color-primary-hover)] transition-all disabled:opacity-50"
              >
                {isResolvingBoleta ? "Guardando..." : "Guardar Cambios"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmación de Edición */}
      <ConfirmActionModal
        open={saveConfirmationOpen}
        onOpenChange={setSaveConfirmationOpen}
        title={
          resolvingGroup?.isBoletaPending && boletaFile
            ? "Confirmar carga de boleta"
            : "Confirmar edición contable"
        }
        description={
          resolvingGroup?.isBoletaPending && boletaFile
            ? `Se adjuntará la boleta y se enviará un correo automático a ${
                boletaRecipients.length > 0
                  ? boletaRecipients.join(", ")
                  : "los apoderados con correo registrado"
              }.`
            : "Se modificarán los datos administrativos de esta transacción y el cambio quedará reflejado en los registros contables."
        }
        variant="default"
        onConfirm={confirmGroupUpdate}
        confirmLabel="Sí, guardar cambios"
        isLoading={isResolvingBoleta}
      />

      {/* Confirmación de Anulación */}
      <ConfirmActionModal
        open={!!voidingGroup}
        onOpenChange={(open) => !open && setVoidingGroup(null)}
        title="¿Estás seguro de anular esta transacción?"
        description="Esta acción marcará los pagos como anulados y descontará el monto de los reportes contables. No se puede deshacer."
        variant="destructive"
        onConfirm={confirmVoidGroup}
        confirmLabel="Sí, anular transacción"
        isLoading={isVoidingGroup}
      />

      {/* Modal de Comprobante / Recibo de Caja Histórico */}
      <PaymentReceiptModal
        open={receiptModalOpen}
        onClose={() => {
          setReceiptModalOpen(false);
          setSelectedReceiptData(null);
        }}
        receiptData={selectedReceiptData}
      />
    </div>
  );
}
