"use client";

import { useEffect, useState, useCallback } from "react";
import { paymentsApi, downloadBlob, resolveUploadUrl } from "@/lib/api";
import { fetchAllCourses, fetchAllStudents } from "@/lib/fetch-all-pages";
import type { Payment, Student, Course } from "@/lib/api";
import { cmdkPersonFilter } from "@/lib/flexible-search";
import { toast } from "sonner";
import { Search, Download, FileText, Plus, FileSpreadsheet, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownChevron, NativeSelectField } from "@/components/ui/dropdown-chevron";
import { formatPaymentDate } from "@/lib/format-payment-date";
import { METHOD_LABELS } from "@/lib/payment-method-labels";
import { PaymentDetailDialog } from "@/components/payment-detail-dialog";

const fieldClass =
  "w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all";

export default function PagosMasterPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [courseFilter, setCourseFilter] = useState("");
  const [studentOpen, setStudentOpen] = useState(false);

  // Filters (studentId se envía a la API; el texto libre no estaba soportado en backend)
  const [filters, setFilters] = useState<{ dateFrom: string; dateTo: string; studentId?: number }>({
    dateFrom: "",
    dateTo: "",
    studentId: undefined,
  });
  const [appliedFilters, setAppliedFilters] = useState<{ dateFrom: string; dateTo: string; studentId?: number }>({
    dateFrom: "",
    dateTo: "",
    studentId: undefined,
  });

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [paymentDetail, setPaymentDetail] = useState<Payment | null>(null);

  useEffect(() => {
    fetchAllCourses().then((data) => setCourses(data)).catch(() => {});
    fetchAllStudents().then((data) => setStudents(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (courseFilter) {
      setFilteredStudents(students.filter((s) => s.courseId === Number(courseFilter)));
    } else {
      setFilteredStudents(students);
    }
  }, [courseFilter, students]);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: page.toString(), limit: "20" };
      if (appliedFilters.dateFrom) params.dateFrom = appliedFilters.dateFrom;
      if (appliedFilters.dateTo) params.dateTo = appliedFilters.dateTo;
      if (appliedFilters.studentId != null) params.studentId = String(appliedFilters.studentId);

      const res = await paymentsApi.getAll(params);
      setPayments(res.data);
      setTotalPages(res.meta.totalPages ?? res.meta.lastPage ?? 1);
      setTotalCount(res.meta.total);
    } catch (err: unknown) {
      toast.error("Error al cargar historial de pagos");
    } finally {
      setLoading(false);
    }
  }, [page, appliedFilters]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleApplyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
  };

  const handleClearFilters = () => {
    const empty = { dateFrom: "", dateTo: "", studentId: undefined as number | undefined };
    setFilters(empty);
    setAppliedFilters(empty);
    setCourseFilter("");
    setPage(1);
  };

  const selectedStudent = filters.studentId != null ? students.find((s) => s.id === filters.studentId) : undefined;

  const handleExportExcel = async () => {
    setIsExporting(true);
    const toastId = toast.loading("Generando Excel...");
    try {
      const params: Record<string, string> = {};
      if (appliedFilters.dateFrom) params.dateFrom = appliedFilters.dateFrom;
      if (appliedFilters.dateTo) params.dateTo = appliedFilters.dateTo;
      if (appliedFilters.studentId != null) params.studentId = String(appliedFilters.studentId);
      const blob = await paymentsApi.export(params);
      downloadBlob(blob, `pagos_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success("Descarga completada", { id: toastId });
    } catch {
      toast.error("Error al exportar", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Historial de Pagos</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">Registro maestro de todas las transacciones</p>
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
                      {selectedStudent ? selectedStudent.name : "Buscar por nombre o RUT..."}
                    </span>
                    <DropdownChevron />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(400px,calc(100vw-2rem))] p-0 z-[60]" align="start">
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
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">Fecha Inicio</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">Fecha Fin</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))}
              className={fieldClass}
              onKeyDown={(e) => e.key === "Enter" && handleApplyFilters()}
            />
          </div>
        </div>
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--color-border)]">
          <span className="text-sm text-[var(--color-text-muted)]">{totalCount} resultados encontrados</span>
          <div className="flex gap-3">
            <button onClick={handleClearFilters} className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors">
              Limpiar
            </button>
            <button onClick={handleApplyFilters} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-hover)] transition-all">
              <Search className="w-4 h-4" /> Buscar
            </button>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden shadow-xl border-[var(--color-border)]">
        <p className="px-6 pt-4 text-xs text-[var(--color-text-muted)]">
          Pasá el cursor sobre una fila y hacé clic para ver el detalle completo del pago.
        </p>
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
        ) : payments.length === 0 ? (
          <div className="text-center py-20 text-[var(--color-text-muted)]">No se encontraron pagos con los filtros actuales</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                    <th className="px-6 py-4">ID / Fecha</th>
                    <th className="px-6 py-4">Alumno</th>
                    <th className="px-6 py-4">Monto</th>
                    <th className="px-6 py-4">Método</th>
                    <th className="px-6 py-4">Pagador</th>
                    <th className="w-12 px-2 py-4" aria-hidden />
                    <th className="px-6 py-4 text-center">Comprobante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {payments.map((p, i) => (
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
                      className="group cursor-pointer border-l-2 border-l-transparent transition-all duration-200 ease-out hover:border-l-[var(--color-primary)] hover:bg-[var(--color-surface-hover)] hover:shadow-[inset_0_0_0_9999px_rgba(59,130,246,0.04)] focus-visible:outline-none focus-visible:border-l-[var(--color-primary)] focus-visible:bg-[var(--color-surface-hover)] animate-fade-in"
                      style={{ animationDelay: `${i * 20}ms` }}
                    >
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-white">#{p.id}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{formatPaymentDate(p.paymentDate)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-white text-sm">{p.student.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{p.student.rut} • {p.student.course?.name}</p>
                      </td>
                      <td className="px-6 py-4 font-bold text-emerald-400">
                        ${p.amount.toLocaleString("es-CL")}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--color-primary-light)] text-blue-300">
                          {METHOD_LABELS[p.method] || p.method}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                        {p.payerName ? (
                          <>
                            <p className="text-white">{p.payerName}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">{p.payerRut || "Sin RUT"}</p>
                          </>
                        ) : (
                          <span className="italic">Apoderado</span>
                        )}
                      </td>
                      <td className="w-12 px-2 py-4 align-middle" aria-hidden>
                        <ChevronRight className="mx-auto w-4 h-4 shrink-0 text-[var(--color-primary)] opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          {p.boletaFileUrl ? (
                            <a 
                              href={resolveUploadUrl(p.boletaFileUrl)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 transition-colors text-xs font-medium border border-slate-700 hover:border-blue-500/30"
                              title={p.boletaNumber ? `Boleta N° ${p.boletaNumber}` : "Ver comprobante"}
                            >
                              <FileText className="w-3.5 h-3.5" /> PDF
                              <Download className="w-3 h-3 ml-1 opacity-70" />
                            </a>
                          ) : (
                            <span className="text-[var(--color-text-muted)] text-sm">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg)]/30">
                <span className="text-sm text-[var(--color-text-muted)]">Página {page} de {totalPages}</span>
                <div className="flex gap-2">
                  <button 
                    disabled={page <= 1} 
                    onClick={() => setPage(p => p - 1)} 
                    className="px-4 py-2 rounded-lg text-sm border border-[var(--color-border)] text-white hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-all"
                  >
                    Anterior
                  </button>
                  <button 
                    disabled={page >= totalPages} 
                    onClick={() => setPage(p => p + 1)} 
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

      <PaymentDetailDialog
        payment={paymentDetail}
        open={paymentDetail != null}
        onOpenChange={(next) => {
          if (!next) setPaymentDetail(null);
        }}
      />
    </div>
  );
}
