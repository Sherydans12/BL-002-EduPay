"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Bell, CheckCircle2, ReceiptText, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { chargesApi, studentsApi } from "@/lib/api";
import type {
  AccountStatementPayment,
  Charge,
  ChargeStatus,
  NotificationLog,
  NotificationStatus,
  Student,
  StudentAccountStatement,
} from "@/lib/api";

type Movement =
  | {
      id: string;
      kind: "charge";
      date: string;
      description: string;
      debit: number;
      credit: null;
      status: ChargeStatus;
      balance: number;
    }
  | {
      id: string;
      kind: "payment";
      date: string;
      description: string;
      debit: null;
      credit: number;
      status: AccountStatementPayment["method"];
      balance: number;
    };

const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  PENDING: "Pendiente",
  PARTIALLY_PAID: "Parcial",
  PAID: "Pagado",
  OVERDUE: "Moroso",
  CANCELLED: "Anulado",
};

const LOG_STATUS_LABELS: Record<NotificationStatus, string> = {
  PENDING: "Pendiente",
  SENT: "Enviado",
  FAILED: "Fallido",
};

const LOG_STATUS_VARIANTS: Record<
  NotificationStatus,
  "success" | "warning" | "destructive"
> = {
  PENDING: "warning",
  SENT: "success",
  FAILED: "destructive",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getPaymentDescription(payment: AccountStatementPayment): string {
  const boleta = payment.paymentGroup?.boletaNumber
    ? `Boleta ${payment.paymentGroup.boletaNumber}`
    : "Pago registrado";
  return payment.referenceCode ? `${boleta} · ${payment.referenceCode}` : boleta;
}

function buildMovements(
  charges: Charge[],
  payments: AccountStatementPayment[],
): Movement[] {
  const rows = [
    ...charges.map((charge) => ({
      id: `charge-${charge.id}`,
      sortDate: charge.dueDate,
      sortKind: 0,
      kind: "charge" as const,
      date: charge.dueDate,
      description: charge.concept?.name ?? "Cargo",
      debit: charge.amount,
      credit: null,
      status: charge.status,
    })),
    ...payments.map((payment) => ({
      id: `payment-${payment.id}`,
      sortDate: payment.paymentDate,
      sortKind: 1,
      kind: "payment" as const,
      date: payment.paymentDate,
      description: getPaymentDescription(payment),
      debit: null,
      credit: payment.amount,
      status: payment.method,
    })),
  ].sort((a, b) => {
    const dateDiff =
      new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime();
    return dateDiff || a.sortKind - b.sortKind;
  });

  let balance = 0;
  return rows.map((row) => {
    balance += row.kind === "charge" ? row.debit : -row.credit;
    return { ...row, balance };
  });
}

export default function StudentFinancialStatementPage() {
  const params = useParams<{ id: string }>();
  const studentId = Number(params.id);
  const [student, setStudent] = useState<Student | null>(null);
  const [statement, setStatement] = useState<StudentAccountStatement | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!Number.isFinite(studentId) || studentId <= 0) {
      toast.error("Alumno inválido");
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const [studentRes, statementRes] = await Promise.all([
          studentsApi.getOne(studentId),
          chargesApi.getAccountStatement(studentId),
        ]);
        if (cancelled) return;
        setStudent(studentRes);
        setStatement(statementRes);
      } catch (err: unknown) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Error al cargar cartola",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const movements = useMemo(
    () =>
      statement
        ? buildMovements(statement.charges, statement.payments)
        : [],
    [statement],
  );

  const logs: NotificationLog[] = statement?.logs ?? [];

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-primary)] border-t-transparent" />
      </div>
    );
  }

  if (!student || !statement) {
    return (
      <div className="mx-auto max-w-4xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[var(--color-text-muted)]">
        No fue posible cargar la ficha financiera del alumno.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10 animate-fade-in">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <Link
            href="/alumnos"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a alumnos
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white">{student.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Badge variant="secondary">{student.course?.name ?? "Sin curso"}</Badge>
              <span className="font-mono tabular-nums">{student.rut}</span>
              <span>{student.guardian?.name ?? "Sin apoderado"}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[620px]">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Facturado
              </span>
              <ReceiptText className="h-4 w-4 text-blue-300" />
            </div>
            <div className="mt-3 text-2xl font-bold tabular-nums text-white">
              {formatCurrency(statement.summary.totalInvoiced)}
            </div>
          </section>
          <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-emerald-100/80">
                Pagado
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            </div>
            <div className="mt-3 text-2xl font-bold tabular-nums text-emerald-300">
              {formatCurrency(statement.summary.totalPaid)}
            </div>
          </section>
          <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-red-100/80">
                Moroso
              </span>
              <Wallet className="h-4 w-4 text-red-300" />
            </div>
            <div className="mt-3 text-2xl font-bold tabular-nums text-red-300">
              {formatCurrency(statement.summary.totalOverdue)}
            </div>
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="glass overflow-hidden rounded-2xl">
          <div className="border-b border-[var(--color-border)] p-5">
            <h2 className="text-lg font-semibold text-white">
              Movimientos de Cuenta Corriente
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Cargos y abonos ordenados por fecha con saldo progresivo.
            </p>
          </div>

          {movements.length === 0 ? (
            <div className="py-16 text-center text-[var(--color-text-muted)]">
              No hay movimientos financieros para este alumno.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[var(--color-bg)]/50 text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="px-5 py-4 whitespace-nowrap">Fecha</th>
                    <th className="px-5 py-4">Movimiento</th>
                    <th className="px-5 py-4 text-right">Cargo</th>
                    <th className="px-5 py-4 text-right">Abono</th>
                    <th className="px-5 py-4 text-right">Saldo</th>
                    <th className="px-5 py-4 text-right">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {movements.map((movement) => (
                    <tr
                      key={movement.id}
                      className="transition-colors hover:bg-[var(--color-surface-hover)]"
                    >
                      <td className="px-5 py-4 text-sm text-[var(--color-text-secondary)] whitespace-nowrap">
                        {formatDate(movement.date)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              movement.kind === "payment"
                                ? "success"
                                : "secondary"
                            }
                          >
                            {movement.kind === "payment" ? "Abono" : "Cargo"}
                          </Badge>
                          <span
                            className={
                              movement.kind === "payment"
                                ? "font-medium text-emerald-200"
                                : "font-medium text-white"
                            }
                          >
                            {movement.description}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-sm tabular-nums text-white">
                        {movement.debit ? formatCurrency(movement.debit) : "—"}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-sm tabular-nums text-emerald-300">
                        {movement.credit
                          ? formatCurrency(movement.credit)
                          : "—"}
                      </td>
                      <td
                        className={`px-5 py-4 text-right font-mono text-sm font-semibold tabular-nums ${
                          movement.balance > 0
                            ? "text-red-300"
                            : "text-emerald-300"
                        }`}
                      >
                        {formatCurrency(movement.balance)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {movement.kind === "charge" ? (
                          <Badge
                            variant={
                              movement.status === "PAID"
                                ? "success"
                                : movement.status === "OVERDUE"
                                  ? "destructive"
                                  : movement.status === "PARTIALLY_PAID"
                                    ? "warning"
                                    : "secondary"
                            }
                          >
                            {CHARGE_STATUS_LABELS[movement.status]}
                          </Badge>
                        ) : (
                          <Badge variant="success">{movement.status}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="glass rounded-2xl">
          <div className="border-b border-[var(--color-border)] p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">
                Notificaciones
              </h2>
              <Bell className="h-5 w-5 text-blue-300" />
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Últimos cobros automáticos registrados para el apoderado.
            </p>
          </div>

          {logs.length === 0 ? (
            <div className="p-5 text-sm text-[var(--color-text-muted)]">
              Sin notificaciones enviadas todavía.
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {logs.map((log) => (
                <article key={log.id} className="space-y-2 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <time className="text-xs font-medium text-[var(--color-text-muted)]">
                      {formatDate(log.createdAt)}
                    </time>
                    <Badge variant={LOG_STATUS_VARIANTS[log.status]}>
                      {LOG_STATUS_LABELS[log.status]}
                    </Badge>
                  </div>
                  <h3 className="line-clamp-2 text-sm font-semibold text-white">
                    {log.subject}
                  </h3>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {log.recipientEmail}
                  </p>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
