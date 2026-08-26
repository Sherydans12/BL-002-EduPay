"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  CreditCard,
  FileText,
  ReceiptText,
  Wallet,
  Sparkles,
  Printer,
  Calendar,
  AlertTriangle,
  Mail,
  Phone,
  ArrowUpRight,
  Search,
  Wand2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { chargesApi, resolveUploadUrl, studentsApi } from "@/lib/api";
import type {
  AccountStatementPayment,
  Charge,
  ChargeStatus,
  NotificationLog,
  NotificationStatus,
  Student,
  StudentAccountStatement,
} from "@/lib/api";
import { formatCLP, formatNumberCLP } from "@/lib/currency-utils";
import { METHOD_LABELS } from "@/lib/payment-method-labels";
import {
  PaymentReceiptModal,
  type PaymentReceiptData,
} from "@/app/(dashboard)/pagos/nuevo/PaymentReceiptModal";

type Movement =
  | {
      id: string;
      rawId: number;
      kind: "charge";
      date: string;
      description: string;
      debit: number;
      credit: null;
      status: ChargeStatus;
      balance: number;
      chargeData: Charge;
    }
  | {
      id: string;
      rawId: number;
      kind: "payment";
      date: string;
      description: string;
      debit: null;
      credit: number;
      status: AccountStatementPayment["method"];
      balance: number;
      boletaFileUrl: string | null;
      paymentData: AccountStatementPayment;
    };

const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  PENDING: "Pendiente",
  PARTIALLY_PAID: "Abonada",
  PAID: "Pagada",
  OVERDUE: "Vencida",
  CANCELLED: "Anulada",
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

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getPaymentDescription(payment: AccountStatementPayment): string {
  const boleta = payment.paymentGroup?.boletaNumber
    ? `Boleta #${payment.paymentGroup.boletaNumber}`
    : payment.boletaNumber
      ? `Boleta #${payment.boletaNumber}`
      : "Comprobante de Pago";
  const concept = payment.concept?.name ? ` · ${payment.concept.name}` : "";
  const ref = payment.referenceCode ? ` (${payment.referenceCode})` : "";
  return `${boleta}${concept}${ref}`;
}

function buildMovements(
  charges: Charge[],
  payments: AccountStatementPayment[],
): Movement[] {
  const rows = [
    ...charges.map((charge) => ({
      id: `charge-${charge.id}`,
      rawId: charge.id,
      sortDate: charge.dueDate,
      sortKind: 0,
      kind: "charge" as const,
      date: charge.dueDate,
      description: charge.concept?.name ?? "Cuota / Arancel",
      debit: charge.amount,
      credit: null,
      status: charge.status,
      chargeData: charge,
    })),
    ...payments.map((payment) => ({
      id: `payment-${payment.id}`,
      rawId: payment.id,
      sortDate: payment.paymentDate,
      sortKind: 1,
      kind: "payment" as const,
      date: payment.paymentDate,
      description: getPaymentDescription(payment),
      debit: null,
      credit: payment.amount,
      status: payment.method,
      boletaFileUrl:
        payment.paymentGroup?.boletaFileUrl ??
        payment.boletaFileUrl ??
        null,
      paymentData: payment,
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
  const [activeTab, setActiveTab] = useState<"cartola" | "cuotas" | "notificaciones">("cartola");
  const [movementSearch, setMovementSearch] = useState("");
  const [receiptModalData, setReceiptModalData] = useState<PaymentReceiptData | null>(null);

  const fetchFinancialStatement = async () => {
    if (!Number.isFinite(studentId) || studentId <= 0) return;
    setLoading(true);
    try {
      const [studentRes, statementRes] = await Promise.all([
        studentsApi.getOne(studentId),
        chargesApi.getAccountStatement(studentId),
      ]);
      setStudent(studentRes);
      setStatement(statementRes);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al cargar ficha financiera",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchFinancialStatement();
  }, [studentId]);

  const movements = useMemo(
    () =>
      statement
        ? buildMovements(statement.charges, statement.payments)
        : [],
    [statement],
  );

  const filteredMovements = useMemo(() => {
    const term = movementSearch.trim().toLowerCase();
    if (!term) return movements;
    return movements.filter(
      (m) =>
        m.description.toLowerCase().includes(term) ||
        m.date.toLowerCase().includes(term) ||
        (m.kind === "payment" && m.status.toLowerCase().includes(term)),
    );
  }, [movementSearch, movements]);

  const logs: NotificationLog[] = statement?.logs ?? [];

  // Summary figures
  const totalInvoiced = statement?.summary.totalInvoiced ?? 0;
  const totalPaid = statement?.summary.totalPaid ?? 0;
  const totalOverdue = statement?.summary.totalOverdue ?? 0;
  const netBalance = totalInvoiced - totalPaid; // > 0 = deudor, < 0 = a favor
  const isOverpaid = totalPaid > totalInvoiced;
  const isPaidInFull = totalInvoiced > 0 && totalPaid >= totalInvoiced;

  const handleOpenReceipt = (payment: AccountStatementPayment) => {
    if (!student) return;

    const receipt: PaymentReceiptData = {
      groupNumber: payment.paymentGroupId ? `#${payment.paymentGroupId}` : `#${payment.id}`,
      receiptNumber: payment.paymentGroup?.receiptNumber || undefined,
      boletaNumber: payment.paymentGroup?.boletaNumber || payment.boletaNumber || undefined,
      paymentDate: payment.paymentDate,
      method: payment.method,
      totalAmount: payment.paymentGroup?.totalAmount ?? payment.amount,
      payerName:
        payment.paymentGroup?.payerName ||
        payment.payerName ||
        student.guardian?.name ||
        "Apoderado",
      payerRut:
        payment.paymentGroup?.payerRut ||
        payment.payerRut ||
        student.guardian?.rut ||
        undefined,
      notes: payment.paymentGroup?.notes || payment.notes || undefined,
      extraCreditGenerated: 0,
      items: [
        {
          studentName: student.name,
          conceptName: payment.concept?.name ?? "Pago registrado",
          amount: payment.amount,
          courseName: student.course?.name ?? undefined,
        },
      ],
    };

    setReceiptModalData(receipt);
  };

  if (loading) {
    return (
      <div className="flex min-h-[65vh] flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-primary)] border-t-transparent" />
        <span className="text-xs text-[var(--color-text-muted)]">Cargando ficha financiera del alumno...</span>
      </div>
    );
  }

  if (!student || !statement) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
        <h2 className="text-lg font-bold text-white">Alumno no encontrado</h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          No fue posible cargar el estado de cuenta para este identificador.
        </p>
        <Link
          href="/alumnos"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-surface-hover)] text-sm font-medium text-white hover:bg-[var(--color-border)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a Alumnos
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16 animate-fade-in print:p-0 print:space-y-4">
      {/* Navegación y Cabecera del Alumno */}
      <div className="flex flex-col gap-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <Link
              href="/alumnos"
              className="inline-flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-white transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Alumnos
            </Link>
            <span>/</span>
            <Link
              href="/cobranzas/setup"
              className="text-[var(--color-text-secondary)] hover:text-white transition-colors"
            >
              Radar de Cobranzas
            </Link>
            <span>/</span>
            <span className="text-white font-medium">Ficha Financiera</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Botón Imprimir Cartola */}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-surface-hover)] transition-all"
              title="Imprimir cartola o guardar como PDF"
            >
              <Printer className="h-4 w-4" />
              <span>Imprimir Cartola</span>
            </button>

            {/* Botón Reestructurar Deuda */}
            <Link
              href="/cobranzas/setup"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-blue-500/35 bg-blue-500/10 text-xs font-medium text-blue-300 hover:bg-blue-500/20 hover:text-white transition-all"
            >
              <Wand2 className="h-4 w-4" />
              <span>Reestructurar Deuda</span>
            </Link>

            {/* Botón Registrar Pago */}
            <Link
              href={`/pagos/nuevo?studentId=${student.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-600/35 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <CreditCard className="h-4 w-4" />
              <span>Registrar Pago</span>
            </Link>
          </div>
        </div>

        {/* Tarjeta de Información del Alumno y Apoderado */}
        <div className="glass rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 border border-blue-400/30 flex items-center justify-center text-white text-xl font-bold shrink-0 shadow-md">
                {student.name.charAt(0).toUpperCase()}
              </div>

              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    {student.name}
                  </h1>
                  <Badge
                    variant={
                      student.financialSetup === "CONFIGURED"
                        ? "success"
                        : "warning"
                    }
                    className="gap-1 text-xs"
                  >
                    {student.financialSetup === "CONFIGURED" ? (
                      <>
                        <ShieldCheck className="w-3 h-3" /> Setup Activo
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3 h-3" /> Setup Pendiente
                      </>
                    )}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                  <span className="font-mono text-blue-300 font-semibold">{student.rut}</span>
                  <span>·</span>
                  <Badge variant="secondary" className="text-xs">
                    {student.course?.name ?? "Sin curso"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Datos de Contacto del Apoderado */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6 bg-[var(--color-bg)]/40 p-3.5 rounded-xl border border-[var(--color-border)]/60 text-xs">
              <div className="space-y-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] block">
                  Apoderado Titular
                </span>
                <span className="font-semibold text-white text-sm block">
                  {student.guardian?.name ?? "Sin apoderado asignado"}
                </span>
                {student.guardian?.rut && (
                  <span className="font-mono text-[11px] text-[var(--color-text-muted)] block">
                    RUT: {student.guardian.rut}
                  </span>
                )}
              </div>

              <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-[var(--color-border)] sm:pl-4 pt-2 sm:pt-0">
                {student.guardian?.email && (
                  <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)] hover:text-white">
                    <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate max-w-[200px]">{student.guardian.email}</span>
                  </div>
                )}
                {student.guardian?.phone && (
                  <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)] hover:text-white">
                    <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{student.guardian.phone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjetas de Resumen Financiero (KPIs) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Facturado Anual */}
        <Card className="glass border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              <span>Facturado Anual</span>
              <ReceiptText className="h-4 w-4 text-blue-400" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums text-white">
              {formatCLP(totalInvoiced)}
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              Total cuotas y cargos proyectados
            </p>
          </CardContent>
        </Card>

        {/* Total Pagado / Recaudado */}
        <Card className="glass border-emerald-500/25 bg-emerald-500/10 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-emerald-200">
              <span>Total Pagado</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-300">
              {formatCLP(totalPaid)}
            </div>
            <p className="text-[11px] text-emerald-200/70 mt-1">
              Ingresos reales contabilizados
            </p>
          </CardContent>
        </Card>

        {/* Deuda Morosa / Vencida */}
        <Card className={`glass shadow-sm ${totalOverdue > 0 ? "border-red-500/35 bg-red-500/10" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-red-200">
              <span>Deuda Vencida</span>
              <AlertTriangle className={`h-4 w-4 ${totalOverdue > 0 ? "text-red-400" : "text-slate-500"}`} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono tabular-nums ${totalOverdue > 0 ? "text-red-300" : "text-slate-400"}`}>
              {formatCLP(totalOverdue)}
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              Cuotas con fecha de vencimiento cumplida
            </p>
          </CardContent>
        </Card>

        {/* Estado de Cuenta / Saldo Actual */}
        {isOverpaid ? (
          <Card className="glass border-emerald-400/40 bg-emerald-500/20 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-400/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-200">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
                  Saldo a Favor
                </span>
                <span className="text-[10px] bg-emerald-400/30 text-emerald-100 px-2 py-0.5 rounded-full">
                  Crédito Disponible
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold font-mono tabular-nums text-emerald-200">
                +{formatCLP(totalPaid - totalInvoiced)}
              </div>
              <p className="text-[11px] text-emerald-100/80 mt-1">
                Abono anticipado libre para futuras cuotas
              </p>
            </CardContent>
          </Card>
        ) : isPaidInFull ? (
          <Card className="glass border-teal-500/30 bg-teal-500/10 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-teal-200">
                <span>Estado de Cuenta</span>
                <CheckCircle2 className="h-4 w-4 text-teal-300" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono tabular-nums text-teal-300">
                Al Día ($0)
              </div>
              <p className="text-[11px] text-teal-200/70 mt-1">
                Sin saldo deudor pendiente
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="glass border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                <span>Saldo Por Cobrar</span>
                <Wallet className="h-4 w-4 text-amber-300" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono tabular-nums text-amber-300">
                {formatCLP(netBalance)}
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                Pendiente por pagar del año escolar
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pestañas de la Ficha: Cartola de Movimientos / Plan de Cuotas / Notificaciones */}
      <div className="glass rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-sm">
        {/* Cabecera de Tabs y Búsqueda */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-[var(--color-border)] bg-[var(--color-bg)]/40 print:hidden">
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as "cartola" | "cuotas" | "notificaciones")}
            className="w-auto"
          >
            <TabsList>
              <TabsTrigger value="cartola" className="gap-1.5 text-xs sm:text-sm">
                <ReceiptText className="w-4 h-4" />
                <span>Cartola de Movimientos ({movements.length})</span>
              </TabsTrigger>
              <TabsTrigger value="cuotas" className="gap-1.5 text-xs sm:text-sm">
                <Calendar className="w-4 h-4" />
                <span>Plan de Cuotas ({statement.charges.length})</span>
              </TabsTrigger>
              <TabsTrigger value="notificaciones" className="gap-1.5 text-xs sm:text-sm">
                <Bell className="w-4 h-4" />
                <span>Notificaciones ({logs.length})</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === "cartola" && (
            <div className="relative min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={movementSearch}
                onChange={(e) => setMovementSearch(e.target.value)}
                placeholder="Filtrar movimientos..."
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-1.5 pl-9 pr-3 text-xs text-white placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-primary)]"
              />
            </div>
          )}
        </div>

        {/* CONTENIDO TAB 1: CARTOLA DE MOVIMIENTOS */}
        {activeTab === "cartola" && (
          <div>
            {filteredMovements.length === 0 ? (
              <div className="py-20 text-center space-y-2 text-[var(--color-text-muted)]">
                <ReceiptText className="w-8 h-8 mx-auto text-[var(--color-text-muted)]/50" />
                <p className="text-sm font-medium text-white">No hay movimientos para mostrar</p>
                <p className="text-xs">No se encontraron cargos o pagos registrados con el filtro actual.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--color-bg)]/60 text-left uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                      <th className="px-5 py-3.5 whitespace-nowrap">Fecha</th>
                      <th className="px-5 py-3.5">Tipo</th>
                      <th className="px-5 py-3.5">Detalle / Concepto</th>
                      <th className="px-5 py-3.5 text-right">Cargo (+)</th>
                      <th className="px-5 py-3.5 text-right">Abono (-)</th>
                      <th className="px-5 py-3.5 text-right">Saldo Progresivo</th>
                      <th className="px-5 py-3.5 text-center">Estado / Método</th>
                      <th className="px-5 py-3.5 text-center print:hidden">Documento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {filteredMovements.map((movement) => (
                      <tr
                        key={movement.id}
                        className="transition-colors hover:bg-[var(--color-surface-hover)] group"
                      >
                        {/* Fecha */}
                        <td className="px-5 py-3.5 font-mono text-[var(--color-text-secondary)] whitespace-nowrap">
                          {formatDate(movement.date)}
                        </td>

                        {/* Tipo de Movimiento */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {movement.kind === "payment" ? (
                            <Badge className="bg-emerald-500/15 border-emerald-500/30 text-emerald-300 font-semibold gap-1 text-[11px]">
                              <ArrowUpRight className="w-3 h-3 text-emerald-400 rotate-45" /> Abono
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
                              Cargo
                            </Badge>
                          )}
                        </td>

                        {/* Descripción / Detalle */}
                        <td className="px-5 py-3.5">
                          <span
                            className={
                              movement.kind === "payment"
                                ? "font-semibold text-emerald-200"
                                : "font-semibold text-white"
                            }
                          >
                            {movement.description}
                          </span>
                        </td>

                        {/* Cargo (Débito) */}
                        <td className="px-5 py-3.5 text-right font-mono font-medium text-white tabular-nums">
                          {movement.debit ? formatCLP(movement.debit) : "—"}
                        </td>

                        {/* Abono (Crédito) */}
                        <td className="px-5 py-3.5 text-right font-mono font-semibold text-emerald-300 tabular-nums">
                          {movement.credit ? `-${formatCLP(movement.credit)}` : "—"}
                        </td>

                        {/* Saldo Progresivo */}
                        <td
                          className={`px-5 py-3.5 text-right font-mono font-bold tabular-nums ${
                            movement.balance > 0
                              ? "text-amber-300"
                              : movement.balance < 0
                                ? "text-emerald-300"
                                : "text-slate-300"
                          }`}
                        >
                          {movement.balance < 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/30 text-[11px]">
                              <Sparkles className="w-2.5 h-2.5" />
                              +{formatCLP(Math.abs(movement.balance))} (A favor)
                            </span>
                          ) : (
                            formatCLP(movement.balance)
                          )}
                        </td>

                        {/* Estado / Método */}
                        <td className="px-5 py-3.5 text-center">
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
                              className="text-[11px]"
                            >
                              {CHARGE_STATUS_LABELS[movement.status]}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[11px] font-medium bg-blue-500/10 text-blue-300 border-blue-500/20">
                              {METHOD_LABELS[movement.status] ?? movement.status}
                            </Badge>
                          )}
                        </td>

                        {/* Documento / Comprobante */}
                        <td className="px-5 py-3.5 text-center print:hidden">
                          {movement.kind === "payment" ? (
                            <div className="inline-flex items-center justify-center gap-1">
                              {/* Botón Ver Recibo Oficial */}
                              <button
                                type="button"
                                onClick={() => handleOpenReceipt(movement.paymentData)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition-colors text-[11px] font-semibold"
                                title="Ver e imprimir comprobante de pago oficial"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Recibo</span>
                              </button>

                              {/* Botón Ver Boleta SII si está adjunta */}
                              {movement.boletaFileUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    window.open(
                                      resolveUploadUrl(movement.boletaFileUrl!),
                                      "_blank",
                                      "noopener,noreferrer",
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 transition-colors text-[11px]"
                                  title="Ver archivo de boleta tributaria"
                                >
                                  <FileText className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ) : (
                            movement.status !== "PAID" ? (
                              <Link
                                href={`/pagos/nuevo?studentId=${student.id}&chargeId=${movement.rawId}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/20 border border-emerald-500/35 text-emerald-300 hover:bg-emerald-600/30 transition-colors text-[11px] font-semibold"
                                title="Pagar esta cuota específica"
                              >
                                <CreditCard className="w-3 h-3" />
                                <span>Pagar</span>
                              </Link>
                            ) : (
                              <span className="text-[11px] text-[var(--color-text-muted)]">—</span>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CONTENIDO TAB 2: PLAN DE CUOTAS */}
        {activeTab === "cuotas" && (
          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Estructura Anual de Cuotas ({statement.charges.length})
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Detalle individual de cada cargo programado para el año escolar.
                </p>
              </div>
              <Link
                href="/cobranzas/setup"
                className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold"
              >
                <Wand2 className="w-3.5 h-3.5" /> Modificar en Setup
              </Link>
            </div>

            {statement.charges.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] p-12 text-center text-xs text-[var(--color-text-muted)] space-y-3">
                <Calendar className="w-8 h-8 mx-auto text-[var(--color-text-muted)]/50" />
                <p className="font-semibold text-white text-sm">Sin plan de cuotas configurado</p>
                <p>El alumno aún no tiene cargos anuales asociados.</p>
                <Link
                  href="/cobranzas/setup"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-xs shadow-md"
                >
                  <Wand2 className="w-3.5 h-3.5" /> Generar Plan Anual
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {statement.charges.map((charge, index) => {
                  const balance = Math.max(charge.amount - charge.paidAmount, 0);
                  const isPaid = charge.status === "PAID" || (charge.amount > 0 && charge.paidAmount >= charge.amount);
                  const isOverdue = new Date(charge.dueDate) < new Date() && !isPaid;

                  return (
                    <div
                      key={charge.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isPaid
                          ? "bg-emerald-500/5 border-emerald-500/25"
                          : isOverdue
                            ? "bg-red-500/5 border-red-500/30"
                            : "bg-[var(--color-bg)]/50 border-[var(--color-border)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center font-mono text-xs font-bold text-[var(--color-text-secondary)]">
                            #{index + 1}
                          </span>
                          <span className="font-semibold text-white text-sm">
                            {charge.concept?.name ?? "Cuota"}
                          </span>
                        </div>
                        <Badge
                          variant={
                            isPaid
                              ? "success"
                              : isOverdue
                                ? "destructive"
                                : charge.paidAmount > 0
                                  ? "warning"
                                  : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {isPaid ? "Pagada" : isOverdue ? "Vencida" : charge.paidAmount > 0 ? "Abonada" : "Pendiente"}
                        </Badge>
                      </div>

                      <div className="space-y-1.5 text-xs text-[var(--color-text-secondary)] py-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--color-text-muted)]">Vencimiento:</span>
                          <span className="font-medium text-white flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-[var(--color-text-muted)]" />
                            {formatDate(charge.dueDate)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--color-text-muted)]">Monto Cuota:</span>
                          <span className="font-mono font-semibold text-white">
                            {formatCLP(charge.amount)}
                          </span>
                        </div>
                        {charge.paidAmount > 0 && (
                          <div className="flex items-center justify-between text-emerald-300 font-medium">
                            <span>Abonado:</span>
                            <span className="font-mono">
                              {formatCLP(charge.paidAmount)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)]/50 font-bold">
                          <span className="text-[var(--color-text-muted)]">Saldo Pendiente:</span>
                          <span className={`font-mono ${balance > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                            {formatCLP(balance)}
                          </span>
                        </div>
                      </div>

                      {!isPaid && (
                        <div className="pt-3">
                          <Link
                            href={`/pagos/nuevo?studentId=${student.id}&chargeId=${charge.id}`}
                            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/35 text-emerald-300 hover:bg-emerald-600/30 text-xs font-semibold transition-all"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Pagar Saldo ({formatCLP(balance)})</span>
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CONTENIDO TAB 3: NOTIFICACIONES */}
        {activeTab === "notificaciones" && (
          <div className="p-5">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Historial de Comunicaciones y Cobranza ({logs.length})
              </h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                Registro de notificaciones de cobranza y avisos enviados al apoderado.
              </p>
            </div>

            {logs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] p-12 text-center text-xs text-[var(--color-text-muted)] space-y-2">
                <Bell className="w-8 h-8 mx-auto text-[var(--color-text-muted)]/50" />
                <p className="font-semibold text-white">Sin notificaciones enviadas aún</p>
                <p>Las alertas de morosidad y recordatorios automáticos aparecerán listadas aquí.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={LOG_STATUS_VARIANTS[log.status]} className="text-[10px]">
                          {LOG_STATUS_LABELS[log.status]}
                        </Badge>
                        <span className="font-semibold text-white">{log.subject}</span>
                      </div>
                      <p className="text-[var(--color-text-muted)]">
                        Destinatario: <strong className="text-[var(--color-text-secondary)]">{log.recipientEmail}</strong>
                      </p>
                    </div>
                    <time className="text-[var(--color-text-muted)] font-mono text-[11px] shrink-0">
                      {formatDate(log.createdAt)}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Comprobante / Recibo de Pago Oficial */}
      {receiptModalData && (
        <PaymentReceiptModal
          open={Boolean(receiptModalData)}
          onOpenChange={(open) => {
            if (!open) setReceiptModalData(null);
          }}
          data={receiptModalData}
        />
      )}
    </div>
  );
}
