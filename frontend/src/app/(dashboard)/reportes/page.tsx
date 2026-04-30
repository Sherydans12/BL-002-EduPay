"use client";

import { useEffect, useState, useCallback } from "react";
import { paymentsApi, coursesApi, studentsApi, reportsApi } from "@/lib/api";
import type { Payment, Course, Student, CourseSummary, ReportSummary } from "@/lib/api";
import { toast } from "sonner";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DownloadCloud, Search } from "lucide-react";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  CHECK: "Cheque",
  TRANSFER: "Transferencia",
};

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

export default function ReportsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [courseSummary, setCourseSummary] = useState<CourseSummary[]>([]);
  const [globalSummary, setGlobalSummary] = useState<ReportSummary | null>(null);
  
  const [totalMeta, setTotalMeta] = useState({ total: 0, page: 1, totalPages: 1 });

  // Input states
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", courseId: "", studentId: "" });
  
  // Applied filters state (only updates on "Aplicar Filtros")
  const [appliedFilters, setAppliedFilters] = useState({ dateFrom: "", dateTo: "", courseId: "", studentId: "" });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"table" | "summary">("table");

  useEffect(() => {
    coursesApi.getAll().then(setCourses).catch(() => {});
    studentsApi.getAll().then(setStudents).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: page.toString(), limit: "20" };
      if (appliedFilters.dateFrom) params.dateFrom = appliedFilters.dateFrom;
      if (appliedFilters.dateTo) params.dateTo = appliedFilters.dateTo;
      if (appliedFilters.courseId) params.courseId = appliedFilters.courseId;
      if (appliedFilters.studentId) params.studentId = appliedFilters.studentId;

      const [payRes, sumRes, globRes] = await Promise.all([
        paymentsApi.getAll(params),
        paymentsApi.summaryByCourse(appliedFilters.dateFrom, appliedFilters.dateTo),
        reportsApi.getSummary(appliedFilters.dateFrom, appliedFilters.dateTo, appliedFilters.courseId)
      ]);

      setPayments(payRes.data);
      setTotalMeta(payRes.meta);
      setCourseSummary(sumRes);
      setGlobalSummary(globRes);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cargar reportes");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page]);

  // Fetch only when appliedFilters or page changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const grandTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  const exportToCsv = () => {
    if (!globalSummary) {
      toast.error("No hay datos para exportar");
      return;
    }
    
    const headers = ["Metodo de Pago", "Transacciones", "Total Recaudado"];
    const rows = globalSummary.byMethod.map(m => [
      METHOD_LABELS[m.method] || m.method,
      m.count.toString(),
      m.total.toString()
    ]);
    
    // Total row
    rows.push(["TOTAL", globalSummary.totalTransactions.toString(), globalSummary.totalCollected.toString()]);
    
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" }); // UTF-8 BOM
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `reporte_pagos_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Archivo CSV exportado exitosamente");
  };

  const pieData = globalSummary?.byMethod.map(m => ({
    name: METHOD_LABELS[m.method] || m.method,
    value: m.total
  })) || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-10">
      <div>
        <h1 className="text-3xl font-bold text-white">Reportes de Pagos</h1>
        <p className="text-[var(--color-text-secondary)] mt-1">Busca, filtra y analiza los pagos registrados</p>
      </div>

      {/* Filters */}
      <div className="glass rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">Fecha Inicio</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">Fecha Fin</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">Curso</label>
            <select
              value={filters.courseId}
              onChange={(e) => setFilters(f => ({ ...f, courseId: e.target.value, studentId: "" }))}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
            >
              <option value="">Todos</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">Alumno</label>
            <select
              value={filters.studentId}
              onChange={(e) => setFilters(f => ({ ...f, studentId: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
            >
              <option value="">Todos</option>
              {students.filter(s => !filters.courseId || s.courseId === Number(filters.courseId)).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--color-text-muted)]">{totalMeta.total} pagos encontrados</span>
            <span className="text-sm font-semibold text-emerald-400">Total visible: ${grandTotal.toLocaleString("es-CL")}</span>
          </div>
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

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface)] w-fit">
          <button onClick={() => setTab("table")} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "table" ? "bg-[var(--color-primary)] text-white shadow" : "text-[var(--color-text-muted)] hover:text-white"}`}>
            Tabla de Pagos
          </button>
          <button onClick={() => setTab("summary")} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === "summary" ? "bg-[var(--color-primary)] text-white shadow" : "text-[var(--color-text-muted)] hover:text-white"}`}>
            Resumen Analítico
          </button>
        </div>
        {tab === "summary" && (
          <button onClick={exportToCsv} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-all">
            <DownloadCloud className="w-4 h-4" /> Exportar CSV
          </button>
        )}
      </div>

      {/* Table View */}
      {tab === "table" && (
        <div className="glass rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
          ) : payments.length === 0 ? (
            <div className="text-center py-20 text-[var(--color-text-muted)]"><p className="text-lg">No se encontraron pagos</p></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                      <th className="px-6 py-4">Fecha</th><th className="px-6 py-4">Alumno</th><th className="px-6 py-4">Curso</th>
                      <th className="px-6 py-4">Monto</th><th className="px-6 py-4">Método</th><th className="px-6 py-4">Pagador</th><th className="px-6 py-4">Boleta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {payments.map((p, i) => (
                      <tr key={p.id} className="hover:bg-[var(--color-surface-hover)] transition-colors animate-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
                        <td className="px-6 py-4 text-sm">{new Date(p.paymentDate).toLocaleDateString("es-CL")}</td>
                        <td className="px-6 py-4"><p className="font-medium text-white text-sm">{p.student.name}</p><p className="text-xs text-[var(--color-text-muted)]">{p.student.rut}</p></td>
                        <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">{p.student.course.name}</td>
                        <td className="px-6 py-4 font-semibold text-emerald-400">${p.amount.toLocaleString("es-CL")}</td>
                        <td className="px-6 py-4"><span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--color-primary-light)] text-blue-300">{METHOD_LABELS[p.method] || p.method}</span></td>
                        <td className="px-6 py-4 text-sm">{p.payerName ? (<div><p className="text-white">{p.payerName}</p>{p.payerRut && <p className="text-xs text-[var(--color-text-muted)]">{p.payerRut}</p>}</div>) : <span className="text-[var(--color-text-muted)] italic">Apoderado</span>}</td>
                        <td className="px-6 py-4">
                          {p.boletaFileUrl ? (
                            <a href={`${API_URL}${p.boletaFileUrl}`} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--color-primary)] hover:underline">{p.boletaNumber || "Ver PDF"}</a>
                          ) : <span className="text-[var(--color-text-muted)]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalMeta.totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)]">
                  <span className="text-sm text-[var(--color-text-muted)]">Página {totalMeta.page} de {totalMeta.totalPages}</span>
                  <div className="flex gap-2">
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 rounded-lg text-sm border border-[var(--color-border)] text-white hover:bg-[var(--color-surface-hover)] disabled:opacity-30">←</button>
                    <button disabled={page >= totalMeta.totalPages} onClick={() => setPage(p => p + 1)} className="px-4 py-2 rounded-lg text-sm border border-[var(--color-border)] text-white hover:bg-[var(--color-surface-hover)] disabled:opacity-30">→</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Summary View */}
      {tab === "summary" && !loading && globalSummary && (
        <div className="space-y-6 animate-fade-in">
          {/* Global Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-[var(--color-text-muted)]">Recaudación Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-400">${globalSummary.totalCollected.toLocaleString("es-CL")}</div>
              </CardContent>
            </Card>
            <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-[var(--color-text-muted)]">Total Transacciones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-400">{globalSummary.totalTransactions}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
              <CardHeader>
                <CardTitle className="text-lg text-white">Métodos de Pago</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                        {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(value: number) => `$${value.toLocaleString("es-CL")}`} contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">Sin datos</div>
                )}
              </CardContent>
            </Card>

            {/* Course Summary */}
            <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
              <CardHeader>
                <CardTitle className="text-lg text-white">Resumen por Curso</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                  {courseSummary.length === 0 ? (
                    <div className="text-center py-10 text-[var(--color-text-muted)]">Sin datos</div>
                  ) : (
                    courseSummary.map(s => (
                      <div key={s.courseId} className="space-y-2">
                        <div className="flex justify-between">
                          <span className="font-medium text-white text-sm">{s.courseName}</span>
                          <span className="font-bold text-emerald-400 text-sm">${s.total.toLocaleString("es-CL")}</span>
                        </div>
                        <div className="h-2 rounded-full bg-[var(--color-bg)] overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                            style={{ width: `${Math.min((s.total / Math.max(...courseSummary.map(x => x.total))) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
