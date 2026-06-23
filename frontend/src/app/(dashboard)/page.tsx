"use client";

import { useEffect, useState } from "react";
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
  AlertCircle,
  Banknote,
  BookOpen,
  FileSpreadsheet,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyticsApi, downloadBlob, reportsApi } from "@/lib/api";
import type { FinancialDashboard } from "@/lib/api";

const emptyDashboard: FinancialDashboard = {
  totalActiveStudents: 0,
  totalCourses: 0,
  currentMonthRevenue: 0,
  totalOverdueDebt: 0,
  totalExpectedRevenue: 0,
  revenueByMonth: [],
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DashboardPage() {
  const [dashboard, setDashboard] =
    useState<FinancialDashboard>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyticsApi
      .getDashboard()
      .then((data) => {
        setDashboard(data);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message || "No se pudo cargar el dashboard financiero.");
      })
      .finally(() => setLoading(false));
  }, []);

  const operationalKpis = [
    {
      title: "Alumnos Activos",
      value: dashboard.totalActiveStudents.toLocaleString("es-CL"),
      icon: Users,
      tone: "text-violet-200",
      iconBg: "bg-violet-500/15",
      border: "border-violet-500/20",
    },
    {
      title: "Cursos",
      value: dashboard.totalCourses.toLocaleString("es-CL"),
      icon: BookOpen,
      tone: "text-amber-200",
      iconBg: "bg-amber-500/15",
      border: "border-amber-500/20",
    },
  ];

  const financialKpis = [
    {
      title: "Recaudación del Mes",
      value: formatCurrency(dashboard.currentMonthRevenue),
      icon: TrendingUp,
      tone: "text-emerald-300",
      iconBg: "bg-emerald-500/15",
      border: "border-emerald-500/25",
      surface: "bg-emerald-500/[0.04]",
    },
    {
      title: "Deuda Morosa",
      value: formatCurrency(dashboard.totalOverdueDebt),
      icon: AlertCircle,
      tone: "text-red-300",
      iconBg: "bg-red-500/15",
      border: "border-red-500/30",
      surface: "bg-red-500/[0.05]",
    },
    {
      title: "Proyección Anual",
      value: formatCurrency(dashboard.totalExpectedRevenue),
      icon: Banknote,
      tone: "text-sky-300",
      iconBg: "bg-sky-500/15",
      border: "border-sky-500/25",
      surface: "bg-sky-500/[0.04]",
    },
  ];

  const handleDownloadMonthlyReport = async () => {
    try {
      setDownloading(true);
      const blob = await reportsApi.monthly();
      downloadBlob(blob, "Reporte_Financiero_Mes.xlsx");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo descargar el cierre del mes.",
      );
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-8 pb-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Panel de Control</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Vista general de operación escolar, recaudación y morosidad.
          </p>
        </div>
        <Button
          className="h-10 w-full gap-2 bg-emerald-500 px-4 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 md:w-auto"
          disabled={downloading}
          onClick={handleDownloadMonthlyReport}
        >
          <FileSpreadsheet className="h-4 w-4" />
          {downloading ? "Preparando cierre..." : "Descargar Cierre del Mes"}
        </Button>
      </div>

      {error ? (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="py-4 text-sm text-red-200">{error}</CardContent>
        </Card>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Operación Escolar
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {operationalKpis.map((kpi) => {
            const Icon = kpi.icon;

            return (
              <Card
                key={kpi.title}
                className={`border-[var(--color-border)] bg-[var(--color-surface)] ${kpi.border}`}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[var(--color-text-muted)]">
                    {kpi.title}
                  </CardTitle>
                  <div className={`rounded-md p-2 ${kpi.iconBg}`}>
                    <Icon className={`h-5 w-5 ${kpi.tone}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className={`text-3xl font-bold tracking-tight ${kpi.tone}`}>
                    {kpi.value}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Estado Financiero
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {financialKpis.map((kpi) => {
            const Icon = kpi.icon;

            return (
              <Card
                key={kpi.title}
                className={`border-[var(--color-border)] bg-[var(--color-surface)] ${kpi.border} ${kpi.surface}`}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-[var(--color-text-muted)]">
                    {kpi.title}
                  </CardTitle>
                  <div className={`rounded-md p-2 ${kpi.iconBg}`}>
                    <Icon className={`h-5 w-5 ${kpi.tone}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold tracking-tight ${kpi.tone}`}>
                    {kpi.value}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Card className="border-[var(--color-border)] bg-[var(--color-surface)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-white">
            Ingresos Históricos por Mes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dashboard.revenueByMonth}
                margin={{ top: 8, right: 12, left: 12, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.08)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-text-muted)", fontSize: 12 }}
                  tickFormatter={(value: number) =>
                    value >= 1_000_000
                      ? `$${(value / 1_000_000).toFixed(1)}M`
                      : `$${Math.round(value / 1_000)}K`
                  }
                  width={68}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  formatter={(value: number) => [
                    formatCurrency(value),
                    "Recaudación",
                  ]}
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    color: "white",
                  }}
                  labelStyle={{ color: "var(--color-text-muted)" }}
                />
                <Bar
                  dataKey="total"
                  fill="#38bdf8"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={56}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
