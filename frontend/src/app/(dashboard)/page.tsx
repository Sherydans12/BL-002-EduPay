"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  TrendingUp,
  FileSpreadsheet,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  Receipt,
  Sparkles,
  Loader2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyticsApi, downloadBlob, reportsApi } from "@/lib/api";
import type { FinancialDashboard } from "@/lib/api";
import { formatCLP } from "@/lib/currency-utils";

const emptyDashboard: FinancialDashboard = {
  totalActiveStudents: 0,
  totalCourses: 0,
  currentMonthRevenue: 0,
  prevMonthRevenue: 0,
  monthOverMonthGrowth: 0,
  currentMonthTransactions: 0,
  yearToDateRevenue: 0,
  totalOverdueDebt: 0,
  totalExpectedRevenue: 0,
  collectionRate: 100,
  alumnosAlDiaCount: 0,
  alumnosMorososCount: 0,
  revenueByMonth: [],
  topCourses: [],
  recentPayments: [],
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  TRANSFER: "Transferencia",
  CASH: "Efectivo",
  DEBIT_CARD: "Tarjeta Débito",
  CREDIT_CARD: "Tarjeta Crédito",
  CHECK: "Cheque",
  WEBPAY: "Webpay",
};

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<FinancialDashboard>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const data = await analyticsApi.getDashboard();
      setDashboard(data);
      setError(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el panel de inteligencia financiera.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleDownloadMonthlyReport = async () => {
    try {
      setDownloading(true);
      const blob = await reportsApi.monthly();
      const date = new Date().toISOString().split("T")[0];
      downloadBlob(blob, `Cierre_Financiero_${date}.xlsx`);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo descargar el cierre del mes.",
      );
    } finally {
      setDownloading(false);
    }
  };

  const currentDateLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("es-CL", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, []);

  const collectionRate = dashboard.collectionRate ?? (
    dashboard.totalExpectedRevenue > 0
      ? Math.round(
          ((dashboard.yearToDateRevenue ?? dashboard.currentMonthRevenue) /
            dashboard.totalExpectedRevenue) *
            100,
        )
      : 100
  );

  if (loading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center text-[var(--color-text-muted)] animate-fade-in">
        <Loader2 className="size-10 animate-spin text-[var(--color-primary)]" />
        <p className="mt-3 text-sm">Calculando indicadores financieros y métricas escolares...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-14 animate-fade-in">
      {/* Hero Header Institucional */}
      <div className="glass relative overflow-hidden rounded-3xl border border-[var(--color-border)] p-6 md:p-8 shadow-2xl bg-gradient-to-br from-[var(--color-surface)] via-[var(--color-surface)] to-blue-950/20">
        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300">
              <Sparkles className="size-3.5" />
              <span>Panel de Inteligencia & Gestión Escolar</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              Tesorería & Cobranzas
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] capitalize">
              {currentDateLabel} · Resumen financiero en tiempo real
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={downloading}
              onClick={handleDownloadMonthlyReport}
              className="gap-2 text-xs border-[var(--color-border)] text-white hover:bg-[var(--color-surface-hover)] shadow-sm"
            >
              {downloading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-3.5 text-emerald-400" />
              )}
              Descargar Cierre Mes
            </Button>

            <Link href="/reportes">
              <Button
                variant="outline"
                className="gap-2 text-xs border-[var(--color-border)] text-white hover:bg-[var(--color-surface-hover)]"
              >
                <FileSpreadsheet className="size-3.5 text-blue-400" />
                Sábana de Cuotas
              </Button>
            </Link>

            <Link href="/pagos/nuevo">
              <Button className="gap-2 text-xs bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-700/25 font-semibold">
                <Plus className="size-3.5" />
                Registrar Pago
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-200 flex items-center gap-3">
          <AlertTriangle className="size-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tarjetas Principales de Inteligencia Financiera */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Recaudación del Mes */}
        <div className="glass rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Recaudación del Mes
            </span>
            <span className="rounded-xl bg-emerald-500/20 p-2 text-emerald-400">
              <TrendingUp className="size-4" />
            </span>
          </div>
          <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-emerald-400">
            {formatCLP(dashboard.currentMonthRevenue)}
          </p>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">
              {dashboard.currentMonthTransactions ?? 0} pagos en el mes
            </span>
            {dashboard.monthOverMonthGrowth !== undefined && (
              <span
                className={`inline-flex items-center font-semibold ${
                  dashboard.monthOverMonthGrowth >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {dashboard.monthOverMonthGrowth >= 0 ? "+" : ""}
                {dashboard.monthOverMonthGrowth}% vs mes ant.
              </span>
            )}
          </div>
        </div>

        {/* Recaudación Anual Acumulada */}
        <div className="glass rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">
              Recaudado Año Actual
            </span>
            <span className="rounded-xl bg-blue-500/20 p-2 text-blue-400">
              <Receipt className="size-4" />
            </span>
          </div>
          <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-white">
            {formatCLP(dashboard.yearToDateRevenue ?? dashboard.currentMonthRevenue)}
          </p>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            de {formatCLP(dashboard.totalExpectedRevenue)} proyectado
          </p>
        </div>

        {/* Morosidad Global */}
        <div className="glass rounded-2xl border border-red-500/30 bg-red-500/5 p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-red-300">
              Morosidad Escolar
            </span>
            <span className="rounded-xl bg-red-500/20 p-2 text-red-400">
              <AlertTriangle className="size-4" />
            </span>
          </div>
          <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-red-400">
            {formatCLP(dashboard.totalOverdueDebt)}
          </p>
          <div className="mt-3 flex items-center justify-between text-xs text-red-300/80">
            <span>{dashboard.alumnosMorososCount ?? 0} alumnos con deuda</span>
            <Link href="/comunicaciones" className="font-semibold hover:underline">
              Cobrar →
            </Link>
          </div>
        </div>

        {/* Tasa Global de Cobranza */}
        <div className="glass rounded-2xl border border-[var(--color-border)] p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Efectividad de Cobro
            </span>
            <span className="rounded-xl bg-purple-500/20 p-2 text-purple-400">
              <ShieldCheck className="size-4" />
            </span>
          </div>
          <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-purple-300">
            {collectionRate}%
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg)]">
              <div
                className="h-full bg-purple-500 transition-all duration-500"
                style={{ width: `${collectionRate}%` }}
              />
            </div>
            <span className="font-mono text-[11px] font-semibold text-[var(--color-text-muted)]">
              {dashboard.totalActiveStudents} alumnos
            </span>
          </div>
        </div>
      </div>

      {/* Gráfico y Desempeño por Cursos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Gráfico de Recaudación Mensual (2 Columnas) */}
        <div className="glass rounded-2xl border border-[var(--color-border)] p-6 shadow-xl lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-white">
                Ingresos Históricos del Año
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Recaudación efectiva mensual en caja
              </p>
            </div>
            <Badge className="border-blue-500/30 bg-blue-500/15 text-blue-300 text-xs font-mono">
              Año {new Date().getFullYear()}
            </Badge>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dashboard.revenueByMonth}
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                  tickFormatter={(value: number) =>
                    value >= 1_000_000
                      ? `$${(value / 1_000_000).toFixed(1)}M`
                      : `$${Math.round(value / 1_000)}K`
                  }
                  width={60}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  formatter={(value: number) => [
                    formatCLP(value),
                    "Recaudado en caja",
                  ]}
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    color: "white",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--color-text-muted)", fontWeight: "bold" }}
                />
                <Bar
                  dataKey="total"
                  fill="#38bdf8"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={44}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Salud de Matrícula, Mensualidades y Cursos (1 Columna) */}
        <div className="space-y-4">
          {/* Card Salud de Matrícula (Inscripciones) */}
          <div className="glass rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-300">
                Salud de Matrículas
              </h3>
              <Badge className="border-blue-500/30 bg-blue-500/15 text-[10px] text-blue-300">
                Inscripciones
              </Badge>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white font-medium">
                  {dashboard.matriculaBreakdown?.paidStudentsCount ?? 0} de {dashboard.matriculaBreakdown?.totalStudentsWithMatricula ?? dashboard.totalActiveStudents} pagadas
                </span>
                <span className="font-mono font-bold text-blue-400">
                  {dashboard.matriculaBreakdown?.healthRate ?? 100}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{
                    width: `${dashboard.matriculaBreakdown?.healthRate ?? 100}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)] font-mono">
                <span>{formatCLP(dashboard.matriculaBreakdown?.totalCollectedAmount ?? 0)}</span>
                <span>de {formatCLP(dashboard.matriculaBreakdown?.totalExpectedAmount ?? 0)}</span>
              </div>
            </div>
          </div>

          {/* Card Salud de Mensualidades (Colegiaturas) */}
          <div className="glass rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                Salud de Mensualidades
              </h3>
              <Badge className="border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-300">
                Cuotas Mes a Mes
              </Badge>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white font-medium">
                  Recaudación de Colegiaturas
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {dashboard.mensualidadesBreakdown?.healthRate ?? 100}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${dashboard.mensualidadesBreakdown?.healthRate ?? 100}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)] font-mono">
                <span className="text-emerald-400 font-semibold">{formatCLP(dashboard.mensualidadesBreakdown?.totalCollectedAmount ?? 0)}</span>
                <span className="text-red-400 font-semibold">{formatCLP(dashboard.mensualidadesBreakdown?.totalOverdueAmount ?? 0)} en mora</span>
              </div>
            </div>
          </div>

          {/* Top Cursos Líderes en Recaudación */}
          <div className="glass rounded-2xl border border-[var(--color-border)] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">
                Cursos con Mayor Recaudación
              </h3>
              <Link
                href="/cursos"
                className="text-[11px] font-semibold text-[var(--color-primary)] hover:underline"
              >
                Ver todos →
              </Link>
            </div>

            <div className="space-y-3">
              {(dashboard.topCourses ?? []).slice(0, 4).map((c) => (
                <div
                  key={c.courseId}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-3"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-white">
                    <Link
                      href={`/cursos/${c.courseId}`}
                      className="hover:text-[var(--color-primary)] transition-colors inline-flex items-center gap-1"
                    >
                      <span>{c.courseName}</span>
                      <ArrowUpRight className="size-2.5 text-[var(--color-primary)]" />
                    </Link>
                    <span className="font-mono text-emerald-400">
                      {formatCLP(c.collectedRevenue)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-surface)]">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${c.collectionRate}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                      {c.collectionRate}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Feed de Actividad en Vivo: Últimos Pagos Registrados */}
      <div className="glass rounded-2xl border border-[var(--color-border)] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="size-4 text-emerald-400" />
              <span>Últimos Pagos Registrados</span>
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              Transacciones recientes ingresadas en caja
            </p>
          </div>
          <Link
            href="/pagos"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            Ver todos los pagos <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--color-bg)]/70 text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
              <tr>
                <th className="px-6 py-3.5">Fecha / Hora</th>
                <th className="px-6 py-3.5">Alumno</th>
                <th className="px-6 py-3.5">Curso</th>
                <th className="px-6 py-3.5">Pagador / Tutor</th>
                <th className="px-6 py-3.5">Método</th>
                <th className="px-6 py-3.5 text-right">Monto Pagado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(dashboard.recentPayments ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--color-text-muted)]">
                    Aún no se han registrado pagos en el período
                  </td>
                </tr>
              ) : (
                dashboard.recentPayments?.map((p) => {
                  const dateStr = new Date(p.paymentDate).toLocaleDateString("es-CL", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-[var(--color-surface-hover)] transition-colors"
                    >
                      <td className="px-6 py-3.5 font-mono text-[var(--color-text-secondary)] whitespace-nowrap">
                        {dateStr}
                      </td>
                      <td className="px-6 py-3.5 font-semibold text-white">
                        {p.studentName}
                      </td>
                      <td className="px-6 py-3.5 text-[var(--color-text-secondary)]">
                        <Badge className="border-blue-500/30 bg-blue-500/15 text-[10px] text-blue-300">
                          {p.courseName}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 text-[var(--color-text-secondary)]">
                        {p.payerName}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge variant="outline" className="text-[10px] text-[var(--color-text-secondary)]">
                          {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono font-bold text-emerald-400">
                        {formatCLP(p.amount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
