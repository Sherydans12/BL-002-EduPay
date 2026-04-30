"use client";

import { useEffect, useState, useCallback } from "react";
import {
  paymentsApi,
  coursesApi,
  studentsApi,
} from "@/lib/api";
import type { Payment, Course, Student, CourseSummary } from "@/lib/api";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  CHECK: "Cheque",
  TRANSFER: "Transferencia",
};

export default function ReportsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [summary, setSummary] = useState<CourseSummary[]>([]);
  const [totalMeta, setTotalMeta] = useState({ total: 0, page: 1, totalPages: 1 });

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [courseId, setCourseId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"table" | "summary">("table");

  useEffect(() => {
    coursesApi.getAll().then(setCourses).catch(() => {});
    studentsApi.getAll().then(setStudents).catch(() => {});
  }, []);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: page.toString(), limit: "20" };
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (courseId) params.courseId = courseId;
      if (studentId) params.studentId = studentId;

      const res = await paymentsApi.getAll(params);
      setPayments(res.data);
      setTotalMeta(res.meta);
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, courseId, studentId, page]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await paymentsApi.summaryByCourse(dateFrom, dateTo);
      setSummary(res);
    } catch {
      // handle silently
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    fetchPayments();
    fetchSummary();
  }, [fetchPayments, fetchSummary]);

  const grandTotal = payments.reduce((sum, p) => sum + p.amount, 0);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Reportes de Pagos</h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          Busca, filtra y analiza los pagos registrados
        </p>
      </div>

      {/* Filters */}
      <div className="glass rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
              Fecha Inicio
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
              Fecha Fin
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
              Curso
            </label>
            <select
              value={courseId}
              onChange={(e) => { setCourseId(e.target.value); setStudentId(""); setPage(1); }}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
            >
              <option value="">Todos</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
              Alumno
            </label>
            <select
              value={studentId}
              onChange={(e) => { setStudentId(e.target.value); setPage(1); }}
              className="w-full px-3 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
            >
              <option value="">Todos</option>
              {students
                .filter((s) => !courseId || s.courseId === Number(courseId))
                .map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--color-text-muted)]">
              {totalMeta.total} pagos encontrados
            </span>
            <span className="text-sm font-semibold text-emerald-400">
              Total visible: ${grandTotal.toLocaleString("es-CL")}
            </span>
          </div>
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); setCourseId(""); setStudentId(""); setPage(1); }}
            className="text-sm text-[var(--color-primary)] hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-surface)] w-fit">
        <button
          onClick={() => setTab("table")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "table"
              ? "bg-[var(--color-primary)] text-white shadow"
              : "text-[var(--color-text-muted)] hover:text-white"
          }`}
        >
          Tabla de Pagos
        </button>
        <button
          onClick={() => setTab("summary")}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            tab === "summary"
              ? "bg-[var(--color-primary)] text-white shadow"
              : "text-[var(--color-text-muted)] hover:text-white"
          }`}
        >
          Resumen por Curso
        </button>
      </div>

      {/* Table View */}
      {tab === "table" && (
        <div className="glass rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-20 text-[var(--color-text-muted)]">
              <p className="text-lg">No se encontraron pagos</p>
              <p className="text-sm mt-1">Ajusta los filtros o registra un nuevo pago</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                      <th className="px-6 py-4">Fecha</th>
                      <th className="px-6 py-4">Alumno</th>
                      <th className="px-6 py-4">Curso</th>
                      <th className="px-6 py-4">Monto</th>
                      <th className="px-6 py-4">Método</th>
                      <th className="px-6 py-4">Pagador</th>
                      <th className="px-6 py-4">Boleta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {payments.map((p, i) => (
                      <tr
                        key={p.id}
                        className="hover:bg-[var(--color-surface-hover)] transition-colors animate-fade-in"
                        style={{ animationDelay: `${i * 30}ms` }}
                      >
                        <td className="px-6 py-4 text-sm">
                          {new Date(p.paymentDate).toLocaleDateString("es-CL")}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-white text-sm">{p.student.name}</p>
                          <p className="text-xs text-[var(--color-text-muted)]">{p.student.rut}</p>
                        </td>
                        <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                          {p.student.course.name}
                        </td>
                        <td className="px-6 py-4 font-semibold text-emerald-400">
                          ${p.amount.toLocaleString("es-CL")}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--color-primary-light)] text-blue-300">
                            {METHOD_LABELS[p.method] || p.method}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {p.payerName ? (
                            <div>
                              <p className="text-white">{p.payerName}</p>
                              {p.payerRut && (
                                <p className="text-xs text-[var(--color-text-muted)]">{p.payerRut}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-[var(--color-text-muted)] italic">Apoderado</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {p.boletaFileUrl ? (
                            <a
                              href={`${API_URL}${p.boletaFileUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                              </svg>
                              {p.boletaNumber || "PDF"}
                            </a>
                          ) : (
                            <span className="text-[var(--color-text-muted)] text-sm">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {totalMeta.totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)]">
                  <span className="text-sm text-[var(--color-text-muted)]">
                    Página {totalMeta.page} de {totalMeta.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="px-4 py-2 rounded-lg text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-white hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-all"
                    >
                      ← Anterior
                    </button>
                    <button
                      disabled={page >= totalMeta.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-4 py-2 rounded-lg text-sm bg-[var(--color-bg)] border border-[var(--color-border)] text-white hover:bg-[var(--color-surface-hover)] disabled:opacity-30 transition-all"
                    >
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Summary View */}
      {tab === "summary" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summary.length === 0 ? (
            <div className="col-span-full text-center py-20 glass rounded-2xl text-[var(--color-text-muted)]">
              No hay datos para el periodo seleccionado
            </div>
          ) : (
            summary.map((s, i) => (
              <div
                key={s.courseId}
                className="glass rounded-2xl p-6 animate-fade-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <h3 className="font-semibold text-white text-lg">{s.courseName}</h3>
                <div className="mt-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-[var(--color-text-muted)]">Pagos registrados</span>
                    <span className="font-semibold text-white">{s.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-[var(--color-text-muted)]">Total recaudado</span>
                    <span className="font-bold text-emerald-400 text-lg">
                      ${s.total.toLocaleString("es-CL")}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--color-bg)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700"
                      style={{
                        width: `${Math.min(
                          (s.total / Math.max(...summary.map((x) => x.total))) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
