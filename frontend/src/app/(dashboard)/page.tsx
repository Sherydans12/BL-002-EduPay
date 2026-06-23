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
import { AlertTriangle, Banknote, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyticsApi } from "@/lib/api";
import type { FinancialDashboard } from "@/lib/api";

const emptyDashboard: FinancialDashboard = {
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

  const kpis = [
    {
      title: "Recaudación del Mes",
      value: formatCurrency(dashboard.currentMonthRevenue),
      icon: Banknote,
      tone: "text-emerald-300",
      iconBg: "bg-emerald-500/15",
    },
    {
      title: "Deuda Morosa (En la calle)",
      value: formatCurrency(dashboard.totalOverdueDebt),
      icon: AlertTriangle,
      tone: "text-red-300",
      iconBg: "bg-red-500/15",
    },
    {
      title: "Proyección Anual",
      value: formatCurrency(dashboard.totalExpectedRevenue),
      icon: TrendingUp,
      tone: "text-sky-300",
      iconBg: "bg-sky-500/15",
    },
  ];

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-bold text-white">Cerebro Financiero</h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Indicadores ejecutivos de recaudación, mora y proyección anual.
        </p>
      </div>

      {error ? (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="py-4 text-sm text-red-200">{error}</CardContent>
        </Card>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;

          return (
            <Card
              key={kpi.title}
              className="border-[var(--color-border)] bg-[var(--color-surface)]"
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
      </section>

      <Card className="border-[var(--color-border)] bg-[var(--color-surface)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-white">
            Ingresos por Mes
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
