"use client";

import { useEffect, useState, useCallback } from "react";
import { paymentsApi } from "@/lib/api";
import type { Payment } from "@/lib/api";
import { toast } from "sonner";
import { Search, Download, FileText, Plus } from "lucide-react";
import Link from "next/link";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  CHECK: "Cheque",
  TRANSFER: "Transferencia",
};

export default function PagosMasterPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", search: "" });
  const [appliedFilters, setAppliedFilters] = useState({ dateFrom: "", dateTo: "", search: "" });
  
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: page.toString(), limit: "20" };
      if (appliedFilters.dateFrom) params.dateFrom = appliedFilters.dateFrom;
      if (appliedFilters.dateTo) params.dateTo = appliedFilters.dateTo;
      if (appliedFilters.search) params.search = appliedFilters.search;

      const res = await paymentsApi.getAll(params);
      setPayments(res.data);
      setTotalPages(res.meta.totalPages);
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
    const empty = { dateFrom: "", dateTo: "", search: "" };
    setFilters(empty);
    setAppliedFilters(empty);
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Historial de Pagos</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">Registro maestro de todas las transacciones</p>
        </div>
        <Link 
          href="/pagos/nuevo"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg hover:shadow-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] text-sm"
        >
          <Plus className="w-4 h-4" /> Registrar Pago
        </Link>
      </div>

      <div className="glass rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">Buscar</label>
            <input
              type="text"
              placeholder="RUT o Nombre del alumno..."
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && handleApplyFilters()}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">Fecha Inicio</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">Fecha Fin</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all"
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
                    <th className="px-6 py-4 text-center">Comprobante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {payments.map((p, i) => (
                    <tr key={p.id} className="hover:bg-[var(--color-surface-hover)] transition-colors animate-fade-in" style={{ animationDelay: `${i * 20}ms` }}>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-white">#{p.id}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{new Date(p.paymentDate).toLocaleDateString("es-CL")}</div>
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
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          {p.boletaFileUrl ? (
                            <a 
                              href={`${API_URL}${p.boletaFileUrl}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
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
    </div>
  );
}
