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
import type { PaymentGroup, Student, Course } from "@/lib/api";
import {
  getGroupBoletaFileUrl,
  getGroupBoletaNumber,
  getGroupPayerLabel,
} from "@/lib/payment-group-utils";
import { cmdkPersonFilter } from "@/lib/flexible-search";
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
  Users,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

const fieldClass =
  "w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all";

function toggleExpandedRow(prev: Set<number>, groupId: number): Set<number> {
  const next = new Set(prev);
  if (next.has(groupId)) next.delete(groupId);
  else next.add(groupId);
  return next;
}

export default function PagosMasterPage() {
  const [groups, setGroups] = useState<PaymentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [courseFilter, setCourseFilter] = useState("");
  const [studentOpen, setStudentOpen] = useState(false);

  const [filters, setFilters] = useState<{
    dateFrom: string;
    dateTo: string;
    studentId?: number;
    courseId?: number;
  }>({
    dateFrom: "",
    dateTo: "",
    studentId: undefined,
    courseId: undefined,
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
  const [isResolvingBoleta, setIsResolvingBoleta] = useState(false);

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
    });
    setPage(1);
  };

  const handleClearFilters = () => {
    const empty = {
      dateFrom: "",
      dateTo: "",
      studentId: undefined as number | undefined,
      courseId: undefined as number | undefined,
    };
    setFilters(empty);
    setAppliedFilters(empty);
    setCourseFilter("");
    setPage(1);
  };

  const selectedStudent =
    filters.studentId != null
      ? students.find((s) => s.id === filters.studentId)
      : undefined;

  const pendingGroups = useMemo(
    () => groups.filter((group) => group.isBoletaPending),
    [groups],
  );

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
    try {
      await paymentsApi.deleteGroup(voidingGroup.id);
      toast.success("Transacción anulada exitosamente");
      setVoidingGroup(null);
      await fetchGroups();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al anular transacción",
      );
    }
  };

  const openResolveBoletaDialog = (group: PaymentGroup) => {
    setResolvingGroup(group);
    setBoletaNumber(getGroupBoletaNumber(group) ?? "");
    setBoletaFile(null);
  };

  const handleResolveBoleta = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resolvingGroup) return;

    const trimmedBoletaNumber = boletaNumber.trim();
    if (!trimmedBoletaNumber) {
      toast.error("Ingresa el número de boleta");
      return;
    }

    const fd = new FormData();
    fd.append("boletaNumber", trimmedBoletaNumber);
    if (boletaFile) fd.append("boleta", boletaFile);

    setIsResolvingBoleta(true);
    try {
      await paymentsApi.resolveBoleta(resolvingGroup.id, fd);
      toast.success("Boleta resuelta exitosamente");
      setResolvingGroup(null);
      setBoletaNumber("");
      setBoletaFile(null);
      await fetchGroups();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al resolver boleta",
      );
    } finally {
      setIsResolvingBoleta(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Historial de Pagos</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">
            Transacciones agrupadas — expandí una fila para ver cada alumno
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-sm font-medium transition-all disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {isExporting ? "Exportando..." : "Exportar Excel"}
          </button>
          <Link
            href="/pagos/nuevo"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg hover:shadow-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] text-sm"
          >
            <Plus className="w-4 h-4" /> Registrar Pago
          </Link>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
                Curso (filtro opcional)
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
                                {s.rut} — {s.course.name}
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
          </div>
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
        </div>
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--color-border)]">
          <span className="text-sm text-[var(--color-text-muted)]">
            {totalCount} transacciones encontradas
          </span>
          <div className="flex gap-3">
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors"
            >
              Limpiar
            </button>
            <button
              onClick={handleApplyFilters}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-all"
            >
              <Search className="w-4 h-4" /> Buscar
            </button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="historial" className="space-y-4">
        <TabsList>
          <TabsTrigger value="historial">Historial General</TabsTrigger>
          <TabsTrigger value="pendientes">
            Bandeja de Pendientes
            {pendingGroups.length > 0 && (
              <span className="ml-2 rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-200">
                {pendingGroups.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="historial" className="mt-0">
          <div className="glass rounded-2xl overflow-hidden shadow-xl border-[var(--color-border)]">
            <p className="px-6 pt-4 text-xs text-[var(--color-text-muted)]">
              Hacé clic en una fila para expandir el detalle por alumno.
            </p>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-20 text-[var(--color-text-muted)]">
                No se encontraron transacciones con los filtros actuales
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                        <th className="w-10 px-4 py-4" aria-hidden />
                        <th className="px-4 py-4">Transacción / Fecha</th>
                        <th className="px-6 py-4">Alumnos</th>
                        <th className="px-6 py-4">Pagador</th>
                        <th className="px-6 py-4">Monto total</th>
                        <th className="px-6 py-4">Método</th>
                        <th className="px-6 py-4 text-center">Comprobante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((group, i) => {
                        const isExpanded = expandedRows.has(group.id);
                        const boletaUrl = getGroupBoletaFileUrl(group);
                        const boletaNum = getGroupBoletaNumber(group);
                        const lineCount = group.payments.length;

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
                              style={{ animationDelay: `${i * 20}ms` }}
                            >
                              <td className="px-4 py-4 align-middle">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-[var(--color-primary)]" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]" />
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-white">
                                    #{group.id}
                                  </span>
                                  {group.isBoletaPending && (
                                    <Badge
                                      variant="destructive"
                                      className="gap-1"
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                      Boleta pendiente
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-[var(--color-text-muted)]">
                                  {formatPaymentDate(group.paymentDate)}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="inline-flex items-center gap-1.5 text-sm text-white">
                                  <Users className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                                  {lineCount === 1
                                    ? group.payments[0].student.name
                                    : `${lineCount} alumnos`}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                                {getGroupPayerLabel(group)}
                              </td>
                              <td className="px-6 py-4 font-bold text-emerald-400 tabular-nums">
                                ${group.totalAmount.toLocaleString("es-CL")}
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--color-primary-light)] text-blue-300">
                                  {METHOD_LABELS[group.method] || group.method}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex justify-center items-center gap-2">
                                  {boletaUrl ? (
                                    <a
                                      href={resolveUploadUrl(boletaUrl)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 transition-colors text-xs font-medium border border-slate-700 hover:border-blue-500/30"
                                      title={
                                        boletaNum
                                          ? `Boleta N° ${boletaNum}`
                                          : "Ver comprobante"
                                      }
                                    >
                                      <FileText className="w-3.5 h-3.5" /> PDF
                                      <Download className="w-3 h-3 ml-1 opacity-70" />
                                    </a>
                                  ) : (
                                    <span className="text-[var(--color-text-muted)] text-sm">
                                      —
                                    </span>
                                  )}
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

                            {isExpanded && (
                              <tr
                                key={`${group.id}-detail`}
                                className="bg-[var(--color-bg)]/80"
                              >
                                <td colSpan={7} className="px-0 py-0">
                                  <div className="px-8 py-4 border-t border-[var(--color-border)]/60">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                                          <th className="pb-2 pr-4 font-semibold">
                                            Alumno
                                          </th>
                                          <th className="pb-2 pr-4 font-semibold">
                                            Curso
                                          </th>
                                          <th className="pb-2 pr-4 font-semibold">
                                            Concepto
                                          </th>
                                          <th className="pb-2 text-right font-semibold">
                                            Monto
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-[var(--color-border)]/40">
                                        {group.payments.map((p) => (
                                          <tr key={p.id}>
                                            <td className="py-2.5 pr-4 text-white">
                                              {p.student.name}
                                            </td>
                                            <td className="py-2.5 pr-4 text-[var(--color-text-secondary)]">
                                              {p.student.course?.name ?? "—"}
                                            </td>
                                            <td className="py-2.5 pr-4 text-[var(--color-text-secondary)]">
                                              {p.concept?.name ?? "—"}
                                            </td>
                                            <td className="py-2.5 text-right font-semibold text-emerald-400/90 tabular-nums">
                                              $
                                              {p.amount.toLocaleString("es-CL")}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
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
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg)]/30">
                    <span className="text-sm text-[var(--color-text-muted)]">
                      Página {page} de {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="px-4 py-2 rounded-lg text-sm border border-[var(--color-border)] text-white hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-all"
                      >
                        Anterior
                      </button>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-4 py-2 rounded-lg text-sm border border-[var(--color-border)] text-white hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-all"
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
          <div className="glass rounded-2xl overflow-hidden shadow-xl border-[var(--color-border)]">
            <div className="px-6 pt-4 pb-3 border-b border-[var(--color-border)]">
              <p className="text-sm font-medium text-white">
                Bandeja de Boletas Pendientes
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Transacciones manuales o automáticas que aún requieren número de
                boleta.
              </p>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : pendingGroups.length === 0 ? (
              <div className="text-center py-20 text-[var(--color-text-muted)]">
                No hay boletas pendientes con los filtros actuales
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                      <th className="px-6 py-4">Fecha</th>
                      <th className="px-6 py-4">Monto total</th>
                      <th className="px-6 py-4">Método</th>
                      <th className="px-6 py-4">Alumnos asociados</th>
                      <th className="px-6 py-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingGroups.map((group) => (
                      <tr
                        key={group.id}
                        className="border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-surface-hover)]"
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-white">
                            #{group.id}
                          </div>
                          <div className="text-xs text-[var(--color-text-muted)]">
                            {formatPaymentDate(group.paymentDate)}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-bold text-emerald-400 tabular-nums">
                          ${group.totalAmount.toLocaleString("es-CL")}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--color-primary-light)] text-blue-300">
                            {METHOD_LABELS[group.method] || group.method}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-white">
                          {group.payments
                            .map((payment) => payment.student.name)
                            .join(", ")}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => openResolveBoletaDialog(group)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-700 hover:shadow-red-500/30 active:scale-[0.98]"
                          >
                            <FileText className="w-4 h-4" />
                            Adjuntar Boleta
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!resolvingGroup}
        onOpenChange={(open) => {
          if (open) return;
          setResolvingGroup(null);
          setBoletaNumber("");
          setBoletaFile(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white">
              Adjuntar Boleta
            </DialogTitle>
            <DialogDescription className="text-[var(--color-text-secondary)]">
              Completa el número de boleta para resolver la transacción
              pendiente.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResolveBoleta} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
                N° de Boleta *
              </label>
              <input
                type="text"
                value={boletaNumber}
                onChange={(event) => setBoletaNumber(event.target.value)}
                className={fieldClass}
                placeholder="Ej: BOL-00587"
                required
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

            <DialogFooter className="mt-6">
              <button
                type="button"
                onClick={() => {
                  setResolvingGroup(null);
                  setBoletaNumber("");
                  setBoletaFile(null);
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
                {isResolvingBoleta ? "Guardando..." : "Guardar y Resolver"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!voidingGroup}
        onOpenChange={(open) => !open && setVoidingGroup(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Estás seguro de anular esta transacción?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--color-text-secondary)]">
              Esta acción marcará los pagos como anulados y descontará el monto
              de los reportes. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-white">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmVoidGroup}
              className="bg-red-600 hover:bg-red-700 text-white border-0"
            >
              Sí, anular transacción
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
