"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  GraduationCap,
  Info,
  Mail,
  MailOpen,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  communicationsApi,
  type CommunicationStats,
  type CommunicationType,
  type DeliveryStatus,
  type SentCommunication,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { EmailTypesGuideModal } from "@/components/email-types-guide-modal";
import { EmailSettingsModal } from "@/components/email-settings-modal";
import { SendCustomCommunicationModal } from "@/components/send-custom-communication-modal";
import { PaymentRemindersModal } from "@/components/payment-reminders-modal";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCLP } from "@/lib/currency-utils";

const TYPE_LABELS: Record<CommunicationType, string> = {
  BOLETA_EMITTED: "Boleta emitida",
  MANUAL_PAYMENT_RECEIPT: "Recibo de pago",
  PAYMENT_REMINDER: "Recordatorio de pago",
  ACCOUNT_STATEMENT: "Estado de cuenta / Mensaje",
};

const TYPE_CLASS: Record<CommunicationType, string> = {
  BOLETA_EMITTED: "border-blue-500/30 bg-blue-500/15 text-blue-300",
  MANUAL_PAYMENT_RECEIPT:
    "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  PAYMENT_REMINDER: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  ACCOUNT_STATEMENT: "border-violet-500/30 bg-violet-500/15 text-violet-300",
};

const STATUS_CLASS: Record<DeliveryStatus, string> = {
  SENT: "border-blue-500/30 bg-blue-500/15 text-blue-300",
  DELIVERED: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  BOUNCED: "border-red-500/30 bg-red-500/15 text-red-300",
  COMPLAINED: "border-rose-500/30 bg-rose-500/15 text-rose-300",
  FAILED: "border-red-500/30 bg-red-500/15 text-red-300",
};

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  SENT: "Enviado a Resend",
  DELIVERED: "Entregado",
  BOUNCED: "Rebotado",
  COMPLAINED: "Marcado como spam",
  FAILED: "Fallido",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

interface CommunicationMetadata {
  studentName?: string;
  studentId?: number;
  courseName?: string;
  amount?: number;
  paymentDate?: string;
  dueDate?: string;
  conceptName?: string;
  conceptsSummary?: string;
  chargesCount?: number;
  boletaNumber?: string;
  boletaUrl?: string;
  paymentGroupId?: number;
  isCustomMessage?: boolean;
}

export function CommunicationsInbox() {
  const [communications, setCommunications] = useState<SentCommunication[]>([]);
  const [stats, setStats] = useState<CommunicationStats | null>(null);
  const [selected, setSelected] = useState<SentCommunication | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState<CommunicationType | "ALL">("ALL");
  const [status, setStatus] = useState<DeliveryStatus | "ALL">("ALL");

  // Modals
  const [customMsgModalOpen, setCustomMsgModalOpen] = useState(false);
  const [remindersModalOpen, setRemindersModalOpen] = useState(false);
  const [emailGuideOpen, setEmailGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [retryTarget, setRetryTarget] = useState<SentCommunication | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const data = await communicationsApi.getStats();
      setStats(data);
    } catch {
      // ignore
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchCommunications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await communicationsApi.getAll({
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        type: type === "ALL" ? undefined : type,
        status: status === "ALL" ? undefined : status,
      });
      setCommunications(response.data);
      setTotal(response.meta.total);
      setTotalPages(response.meta.totalPages ?? response.meta.lastPage ?? 1);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible cargar las comunicaciones",
      );
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page, status, type]);

  useEffect(() => {
    void fetchCommunications();
  }, [fetchCommunications]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const clearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setType("ALL");
    setStatus("ALL");
    setPage(1);
  };

  const retryCommunication = async () => {
    if (!retryTarget) return;

    setRetrying(true);
    try {
      await communicationsApi.retry(retryTarget.id);
      toast.success("Correo reenviado a la cola de Resend");
      setRetryTarget(null);
      await fetchCommunications();
      await fetchStats();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible reintentar el envío del correo",
      );
    } finally {
      setRetrying(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado al portapapeles`);
  };

  const hasActiveFilters =
    searchTerm.length > 0 || type !== "ALL" || status !== "ALL";

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-fade-in">
        {/* Cabecera Principal */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
                <Mail className="size-5" />
              </span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">
                  Comunicaciones
                </h1>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Bandeja centralizada de avisos, recordatorios y comprobantes enviados por EduPay
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setEmailGuideOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              <Info className="size-3.5 text-[var(--color-primary)]" />
              Guía de Plantillas
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              <Settings className="size-3.5 text-[var(--color-primary)]" />
              Configurar Envíos
            </button>
            <button
              type="button"
              onClick={() => setCustomMsgModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-500/40 bg-blue-600/20 px-3.5 py-2.5 text-xs font-semibold text-blue-300 transition-colors hover:bg-blue-600/30"
            >
              <Plus className="size-3.5" />
              Redactar Mensaje
            </button>
            <button
              type="button"
              onClick={() => setRemindersModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[var(--color-primary)]/20 transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              <BellRing className="size-3.5" />
              Enviar Recordatorios
            </button>
          </div>
        </div>

        {/* KPIs de Entregabilidad y Cobranza */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">
                Total Envíos
              </span>
              <span className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                <Send className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-white">
              {stats?.totalSent ?? total}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Correos emitidos por el colegio
            </p>
          </div>

          <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">
                Tasa de Entrega
              </span>
              <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="size-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-400">
                {stats?.deliveryRate ?? 100}%
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                ({stats?.deliveredCount ?? 0} entregados)
              </span>
            </div>
            <p className="mt-1 text-[11px] text-emerald-300/80">
              {stats?.sentViaResendCount ? `${stats.sentViaResendCount} en tránsito` : "Entregabilidad óptima"}
            </p>
          </div>

          <div
            onClick={() => setStatus("FAILED")}
            className="glass cursor-pointer rounded-2xl border border-[var(--color-border)] p-4 shadow-sm transition-colors hover:border-red-500/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">
                Fallidos / Rebotados
              </span>
              <span className="flex size-7 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                <XCircle className="size-3.5" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold text-red-400">
              {(stats?.failedCount ?? 0) + (stats?.bouncedCount ?? 0)}
            </p>
            <p className="mt-1 text-[11px] text-red-300/70">
              Clic para filtrar y reintentar
            </p>
          </div>

          <div
            onClick={() => setRemindersModalOpen(true)}
            className="glass cursor-pointer rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm transition-colors hover:border-amber-500/50"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-300">
                Morosidad Notificable
              </span>
              <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">
                <BellRing className="size-3.5" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-amber-300">
                {stats?.pendingRemindersCount ?? 0}
              </span>
              <span className="font-mono text-sm font-semibold text-amber-200">
                {formatCLP(stats?.totalOverdueAmount ?? 0)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-amber-300/80">
              Apoderados con cuotas por cobrar
            </p>
          </div>
        </div>

        {/* Tabla Principal y Filtros */}
        <section className="glass overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-xl">
          <header className="border-b border-[var(--color-border)] px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-white">Historial de Notificaciones</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Registro ordenado cronológicamente con estados de entrega en tiempo real
                </p>
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                Mostrando {communications.length} de {total} registros
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(260px,1fr)_220px_220px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por email, apoderado, alumno o asunto..."
                  className="h-10 border-[var(--color-border)] bg-[var(--color-bg)] pl-9 text-xs text-white"
                />
              </div>

              <Select
                value={type}
                onValueChange={(val) => {
                  setType(val as CommunicationType | "ALL");
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-full border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="ALL">Todos los tipos de correo</SelectItem>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={status}
                onValueChange={(val) => {
                  setStatus(val as DeliveryStatus | "ALL");
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-full border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="ALL">Todos los estados</SelectItem>
                  <SelectItem value="DELIVERED">Entregado</SelectItem>
                  <SelectItem value="SENT">Enviado a Resend</SelectItem>
                  <SelectItem value="BOUNCED">Rebotado</SelectItem>
                  <SelectItem value="FAILED">Fallido</SelectItem>
                  <SelectItem value="COMPLAINED">Marcado como spam</SelectItem>
                </SelectContent>
              </Select>

              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="h-10 rounded-xl border border-[var(--color-border)] px-4 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-white disabled:cursor-default disabled:opacity-40"
              >
                Limpiar
              </button>
            </div>
          </header>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="size-8 animate-spin rounded-full border-3 border-[var(--color-primary)] border-t-transparent" />
            </div>
          ) : communications.length === 0 ? (
            <div className="py-20 text-center text-[var(--color-text-muted)]">
              <Mail className="mx-auto size-10 text-[var(--color-text-muted)]/50" />
              <p className="mt-3 text-sm font-medium">No se encontraron comunicaciones</p>
              <p className="mt-1 text-xs">Ajusta los filtros o realiza un nuevo envío</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[950px]">
                  <thead>
                    <tr className="bg-[var(--color-bg)]/50 text-left text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      <th className="px-6 py-3.5">Fecha / Hora</th>
                      <th className="px-6 py-3.5">Destinatario</th>
                      <th className="px-6 py-3.5">Alumno / Curso</th>
                      <th className="px-6 py-3.5">Asunto</th>
                      <th className="px-6 py-3.5">Tipo</th>
                      <th className="px-6 py-3.5">Estado</th>
                      <th className="px-6 py-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)] text-sm">
                    {communications.map((communication) => {
                      const meta = (communication.metadata ?? {}) as CommunicationMetadata;
                      const StatusIcon =
                        communication.status === "DELIVERED"
                          ? CheckCircle2
                          : communication.status === "FAILED" ||
                              communication.status === "BOUNCED" ||
                              communication.status === "COMPLAINED"
                            ? XCircle
                            : Clock;

                      const statusBadge = (
                        <Badge
                          className={`${STATUS_CLASS[communication.status]} gap-1 text-[11px]`}
                        >
                          <StatusIcon className="size-3" />
                          {STATUS_LABEL[communication.status]}
                        </Badge>
                      );

                      return (
                        <tr
                          key={communication.id}
                          className="transition-colors hover:bg-[var(--color-surface-hover)]"
                        >
                          <td className="whitespace-nowrap px-6 py-3.5 text-xs text-[var(--color-text-secondary)]">
                            {formatDateTime(communication.createdAt)}
                          </td>

                          <td className="max-w-[200px] px-6 py-3.5">
                            <p className="truncate text-xs font-semibold text-white">
                              {communication.recipientEmail}
                            </p>
                            {communication.recipientName ? (
                              <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                                {communication.recipientName}
                              </p>
                            ) : null}
                          </td>

                          <td className="max-w-[180px] px-6 py-3.5">
                            {meta.studentName ? (
                              <div>
                                <p className="truncate text-xs font-medium text-white">
                                  {meta.studentName}
                                </p>
                                {meta.courseName && (
                                  <p className="truncate text-[11px] text-blue-400">
                                    {meta.courseName}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-[var(--color-text-muted)]">—</span>
                            )}
                          </td>

                          <td className="max-w-[240px] px-6 py-3.5">
                            <p className="truncate text-xs font-medium text-white">
                              {communication.subject}
                            </p>
                          </td>

                          <td className="whitespace-nowrap px-6 py-3.5">
                            <Badge className={`${TYPE_CLASS[communication.type]} text-[11px]`}>
                              {TYPE_LABELS[communication.type]}
                            </Badge>
                          </td>

                          <td className="whitespace-nowrap px-6 py-3.5">
                            {(communication.status === "FAILED" ||
                              communication.status === "BOUNCED") &&
                            communication.errorMessage ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">{statusBadge}</span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                  {communication.errorMessage}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              statusBadge
                            )}
                          </td>

                          <td className="whitespace-nowrap px-6 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {(communication.status === "FAILED" ||
                                communication.status === "BOUNCED") && (
                                <button
                                  type="button"
                                  onClick={() => setRetryTarget(communication)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]"
                                >
                                  <RefreshCw className="size-3" />
                                  Reintentar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelected(communication)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]"
                              >
                                <MailOpen className="size-3" />
                                Detalle
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <TablePagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={20}
                onPrev={() => setPage((c) => Math.max(1, c - 1))}
                onNext={() => setPage((c) => Math.min(totalPages, c + 1))}
              />
            </>
          )}
        </section>

        {/* Drawer de Detalle Completo de Comunicación */}
        <Sheet
          open={selected != null}
          onOpenChange={(open) => !open && setSelected(null)}
        >
          <SheetContent className="sm:max-w-lg">
            {selected ? (
              <>
                <SheetHeader>
                  <div className="flex items-center gap-2">
                    <Badge className={TYPE_CLASS[selected.type]}>
                      {TYPE_LABELS[selected.type]}
                    </Badge>
                    <Badge className={STATUS_CLASS[selected.status]}>
                      {STATUS_LABEL[selected.status]}
                    </Badge>
                  </div>
                  <SheetTitle className="mt-2 text-lg font-bold text-white">
                    {selected.subject}
                  </SheetTitle>
                  <SheetDescription className="text-xs text-[var(--color-text-secondary)]">
                    Destinatario: {selected.recipientName ? `${selected.recipientName} (${selected.recipientEmail})` : selected.recipientEmail}
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-4 overflow-y-auto p-6 text-xs">
                  {/* Error Alert Box */}
                  {selected.errorMessage && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-100">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-red-200">
                          Error reportado en el envío
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setRetryTarget(selected);
                            setSelected(null);
                          }}
                          className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-500"
                        >
                          <RefreshCw className="size-3" />
                          Reintentar ahora
                        </button>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-4 text-red-300">
                        {selected.errorMessage}
                      </p>
                    </div>
                  )}

                  {/* Detalle Contable & Contexto */}
                  {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                        Contexto Escolar & Financiero
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        {Boolean((selected.metadata as CommunicationMetadata).studentName) && (
                          <div>
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              Alumno
                            </span>
                            <p className="font-semibold text-white">
                              {(selected.metadata as CommunicationMetadata).studentName}
                            </p>
                          </div>
                        )}

                        {Boolean((selected.metadata as CommunicationMetadata).courseName) && (
                          <div>
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              Curso
                            </span>
                            <p className="font-semibold text-blue-400">
                              {(selected.metadata as CommunicationMetadata).courseName}
                            </p>
                          </div>
                        )}

                        {Boolean((selected.metadata as CommunicationMetadata).amount) && (
                          <div>
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              Monto Involucrado
                            </span>
                            <p className="font-mono font-bold text-white">
                              {formatCLP((selected.metadata as CommunicationMetadata).amount!)}
                            </p>
                          </div>
                        )}

                        {Boolean((selected.metadata as CommunicationMetadata).conceptName) && (
                          <div>
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              Concepto
                            </span>
                            <p className="text-white">
                              {(selected.metadata as CommunicationMetadata).conceptName}
                            </p>
                          </div>
                        )}

                        {Boolean((selected.metadata as CommunicationMetadata).conceptsSummary) && (
                          <div className="col-span-2">
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              Resumen de Cuotas
                            </span>
                            <p className="text-white">
                              {(selected.metadata as CommunicationMetadata).conceptsSummary}
                            </p>
                          </div>
                        )}

                        {Boolean((selected.metadata as CommunicationMetadata).boletaUrl) && (
                          <div className="col-span-2 mt-1">
                            <a
                              href={(selected.metadata as CommunicationMetadata).boletaUrl!}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 font-medium text-blue-300 hover:bg-blue-500/20"
                            >
                              <FileText className="size-3.5" />
                              Ver Boleta Tributaria Adjunta
                              <ExternalLink className="size-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Metadata Técnica */}
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                        Trazabilidad Técnica
                      </p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selected.id, "ID de Comunicación")}
                        className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-white"
                      >
                        <Copy className="size-3" />
                        Copiar ID
                      </button>
                    </div>

                    <div className="mt-2 space-y-1 font-mono text-[11px] text-[var(--color-text-secondary)]">
                      <p>
                        <span className="text-[var(--color-text-muted)]">ID Interno: </span>
                        {selected.id}
                      </p>
                      <p>
                        <span className="text-[var(--color-text-muted)]">Fecha Envío: </span>
                        {formatDateTime(selected.createdAt)}
                      </p>
                    </div>

                    <pre className="mt-3 max-h-40 overflow-x-auto rounded-lg bg-black/40 p-2.5 font-mono text-[10px] leading-4 text-emerald-400">
                      {JSON.stringify(selected.metadata ?? {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </>
            ) : null}
          </SheetContent>
        </Sheet>

        {/* Modal para redactar comunicado manual */}
        <SendCustomCommunicationModal
          open={customMsgModalOpen}
          onOpenChange={setCustomMsgModalOpen}
          onSent={() => {
            void fetchCommunications();
            void fetchStats();
          }}
        />

        {/* Modal de recordatorios masivos con preview en vivo */}
        <PaymentRemindersModal
          open={remindersModalOpen}
          onOpenChange={setRemindersModalOpen}
          onSent={() => {
            void fetchCommunications();
            void fetchStats();
          }}
        />

        {/* Guía de Plantillas */}
        <EmailTypesGuideModal
          open={emailGuideOpen}
          onOpenChange={setEmailGuideOpen}
        />

        {/* Configuración de Envíos */}
        <EmailSettingsModal
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onSaved={() => {
            void fetchCommunications();
            void fetchStats();
          }}
        />

        {/* Confirmar Reintento de Correo */}
        <ConfirmActionModal
          open={retryTarget != null}
          onOpenChange={(open) => !open && setRetryTarget(null)}
          title="Reintentar envío de correo"
          description={`¿Deseas reenviar este correo a ${retryTarget?.recipientEmail ?? "este destinatario"}?`}
          variant="default"
          onConfirm={retryCommunication}
          confirmLabel="Sí, reintentar envío"
          isLoading={retrying}
        />
      </div>
    </TooltipProvider>
  );
}
