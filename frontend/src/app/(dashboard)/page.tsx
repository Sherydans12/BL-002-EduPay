"use client";

import { useEffect, useState } from "react";
import { coursesApi, studentsApi, paymentsApi, reportsApi } from "@/lib/api";
import type { Payment, ReportSummary, RevenueTrendItem } from "@/lib/api";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  Users,
  BookOpen,
  CreditCard,
  DollarSign,
  Plus,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatPaymentDate } from "@/lib/format-payment-date";

// ─── Helpers ─────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "hace un momento";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} días`;
  return formatPaymentDate(dateStr);
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-violet-500",
  "bg-amber-500", "bg-rose-500", "bg-cyan-500",
];
function avatarColor(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  CHECK: "Cheque",
  TRANSFER: "Transferencia",
};

// ─── Custom AreaChart Tooltip ────────────────────────────────
function RevenueTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-xs text-[var(--color-text-muted)] mb-1">{label}</p>
      <p className="font-bold text-emerald-400 text-sm">
        ${Number(payload[0].value ?? 0).toLocaleString("es-CL")}
      </p>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────
export default function DashboardPage() {
  const [courseCount, setCourseCount] = useState(0);
  const [studentCount, setStudentCount] = useState(0);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<ReportSummary | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrendItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const now = new Date();
      const y = now.getFullYear(), mo = now.getMonth();
      const monthStart = new Date(y, mo, 1).toISOString().split("T")[0];
      const monthEnd = new Date(y, mo + 1, 0).toISOString().split("T")[0];

      const [cRes, sRes, pRes, sumRes, trendRes] = await Promise.all([
        coursesApi.getAll(1, 1),
        studentsApi.getAll({ page: 1, limit: 1 }),
        paymentsApi.getAll({ limit: "5" }),
        reportsApi.getSummary(monthStart, monthEnd),
        reportsApi.getRevenueTrend(12),
      ]);
      setCourseCount(cRes.meta.total);
      setStudentCount(sRes.meta.total);
      setRecentPayments(pRes.data);
      setMonthlySummary(sumRes);
      setRevenueTrend(trendRes);
    }
    load().catch(() => {}).finally(() => setLoading(false));
  }, []);

  const kpis = [
    {
      title: "Ingresos del Mes",
      value: monthlySummary
        ? `$${monthlySummary.totalCollected.toLocaleString("es-CL")}`
        : "$0",
      sub: new Date().toLocaleDateString("es-CL", { month: "long", year: "numeric" }),
      icon: <DollarSign className="w-5 h-5" />,
      gradient: "from-emerald-500 to-green-400",
      ring: "ring-emerald-500/20",
    },
    {
      title: "Pagos del Mes",
      value: monthlySummary?.totalTransactions ?? 0,
      sub: "transacciones registradas",
      icon: <CreditCard className="w-5 h-5" />,
      gradient: "from-blue-500 to-cyan-400",
      ring: "ring-blue-500/20",
    },
    {
      title: "Alumnos Activos",
      value: studentCount,
      sub: "matriculados actualmente",
      icon: <Users className="w-5 h-5" />,
      gradient: "from-violet-500 to-purple-400",
      ring: "ring-violet-500/20",
    },
    {
      title: "Cursos Activos",
      value: courseCount,
      sub: "cursos en sistema",
      icon: <BookOpen className="w-5 h-5" />,
      gradient: "from-amber-500 to-orange-400",
      ring: "ring-amber-500/20",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-12 h-12 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-10">

      {/* ── Header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          Resumen general del sistema EduPay
        </p>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map((kpi, i) => (
          <Card
            key={kpi.title}
            className={`bg-[var(--color-surface)] border-[var(--color-border)] ring-1 ${kpi.ring} animate-fade-in`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-[var(--color-text-muted)]">
                {kpi.title}
              </CardTitle>
              <div
                className={`w-9 h-9 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center text-white shadow-lg shrink-0`}
              >
                {kpi.icon}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-white tracking-tight">{kpi.value}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Revenue Trend Chart ───────────────────────────────── */}
      <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-white">
                  Tendencia de Ingresos
                </CardTitle>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  Últimos 12 meses
                </p>
              </div>
            </div>
            <Link
              href="/reportes"
              className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:text-blue-300 transition-colors"
            >
              Ver reportes <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {revenueTrend.every((d) => d.total === 0) ? (
            <div className="flex flex-col items-center justify-center h-[220px] text-[var(--color-text-muted)]">
              <BarChart3 className="w-10 h-10 opacity-30 mb-3" />
              <p className="text-sm">Sin datos de ingresos aún</p>
            </div>
          ) : (
            <div className="h-[220px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={revenueTrend}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.06)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) =>
                      v >= 1_000_000
                        ? `$${(v / 1_000_000).toFixed(1)}M`
                        : v >= 1_000
                          ? `$${(v / 1_000).toFixed(0)}K`
                          : `$${v}`
                    }
                    tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip content={<RevenueTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="url(#revenueGradient)"
                    dot={false}
                    activeDot={{ r: 5, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Bottom Row: Quick Actions + Activity Feed ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Quick Actions */}
        <Card className="bg-[var(--color-surface)] border-[var(--color-border)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-white">
              Acciones Rápidas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                href: "/pagos/nuevo",
                label: "Registrar Pago",
                sub: "Nuevo pago manual",
                color: "blue",
                icon: <Plus className="w-4 h-4" />,
              },
              {
                href: "/alumnos",
                label: "Gestionar Alumnos",
                sub: "Agregar o editar",
                color: "emerald",
                icon: <Users className="w-4 h-4" />,
              },
              {
                href: "/reportes",
                label: "Ver Reportes",
                sub: "Análisis por período",
                color: "violet",
                icon: <BarChart3 className="w-4 h-4" />,
              },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-r from-${action.color}-600/15 to-${action.color}-600/5 border border-${action.color}-500/25 hover:border-${action.color}-400/50 transition-all duration-200 group`}
              >
                <div
                  className={`w-9 h-9 rounded-lg bg-${action.color}-500 flex items-center justify-center text-white group-hover:scale-110 transition-transform shrink-0`}
                >
                  {action.icon}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-white text-sm">{action.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{action.sub}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-[var(--color-text-muted)] ml-auto shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="lg:col-span-2 bg-[var(--color-surface)] border-[var(--color-border)]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-white">
                Actividad Reciente
              </CardTitle>
              <Link
                href="/pagos"
                className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:text-blue-300 transition-colors"
              >
                Ver todos <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-muted)]">
                <CreditCard className="w-12 h-12 opacity-25 mb-3" />
                <p className="text-sm">No hay pagos registrados</p>
                <Link
                  href="/pagos/nuevo"
                  className="text-[var(--color-primary)] hover:underline text-xs mt-2"
                >
                  Registrar primer pago →
                </Link>
              </div>
            ) : (
              <div className="space-y-1">
                {recentPayments.map((p, i) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-4 px-3 py-3 rounded-xl hover:bg-[var(--color-surface-hover)] transition-colors animate-fade-in"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-10 h-10 rounded-xl ${avatarColor(p.student.name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}
                    >
                      {initials(p.student.name)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white text-sm truncate">
                        {p.student.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] truncate">
                        {p.concept?.name ?? METHOD_LABELS[p.method] ?? p.method}
                        {" · "}
                        {p.student.course?.name}
                      </p>
                    </div>

                    {/* Amount + time */}
                    <div className="text-right shrink-0">
                      <p className="font-bold text-emerald-400 text-sm">
                        ${p.amount.toLocaleString("es-CL")}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {timeAgo(p.paymentDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
