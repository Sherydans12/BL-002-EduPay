"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, MailOpen, Search, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { communicationsApi } from "@/lib/api";
import type {
  CommunicationType,
  DeliveryStatus,
  SentCommunication,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
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

const TYPE_LABELS: Record<CommunicationType, string> = {
  BOLETA_EMITTED: "Boleta emitida",
  MANUAL_PAYMENT_RECEIPT: "Recibo de pago",
  PAYMENT_REMINDER: "Recordatorio de pago",
  ACCOUNT_STATEMENT: "Estado de cuenta",
};

const TYPE_CLASS: Record<CommunicationType, string> = {
  BOLETA_EMITTED: "border-blue-500/30 bg-blue-500/15 text-blue-300",
  MANUAL_PAYMENT_RECEIPT:
    "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  PAYMENT_REMINDER: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  ACCOUNT_STATEMENT: "border-violet-500/30 bg-violet-500/15 text-violet-300",
};

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  SENT: "Enviado",
  FAILED: "Fallido",
};

const STATUS_CLASS: Record<DeliveryStatus, string> = {
  SENT: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  FAILED: "border-red-500/30 bg-red-500/15 text-red-300",
};

const STATUS_ICON: Record<DeliveryStatus, typeof CheckCircle2> = {
  SENT: CheckCircle2,
  FAILED: XCircle,
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ComunicacionesPage() {
  const [logs, setLogs] = useState<SentCommunication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<SentCommunication | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<DeliveryStatus | "ALL">(
    "ALL",
  );
  const [filterType, setFilterType] = useState<CommunicationType | "ALL">(
    "ALL",
  );
  const [reminderConfirmationOpen, setReminderConfirmationOpen] =
    useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await communicationsApi.getAll({
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        status: filterStatus === "ALL" ? undefined : filterStatus,
        type: filterType === "ALL" ? undefined : filterType,
      });
      setLogs(res.data);
      setTotalPages(res.meta.totalPages ?? res.meta.lastPage ?? 1);
      setTotalCount(res.meta.total);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al cargar comunicaciones",
      );
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, filterStatus, filterType]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const hasActiveFilters =
    searchTerm.length > 0 || filterStatus !== "ALL" || filterType !== "ALL";

  const clearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setFilterStatus("ALL");
    setFilterType("ALL");
    setPage(1);
  };

  const sendPaymentReminders = async () => {
    setSendingReminders(true);
    try {
      const result = await communicationsApi.sendPaymentReminders();
      toast.success(
        `Recordatorios procesados: ${result.sent} enviados, ${result.failed} fallidos`,
      );
      setReminderConfirmationOpen(false);
      setPage(1);
      await fetchLogs();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible enviar los recordatorios",
      );
    } finally {
      setSendingReminders(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Comunicaciones</h1>
          <p className="mt-1 text-[var(--color-text-secondary)]">
            Bandeja centralizada de correos enviados por EduPay
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text-secondary)]">
            <Send className="h-4 w-4 text-[var(--color-primary)]" />
            {totalCount} registros
          </div>
          <button
            type="button"
            onClick={() => setReminderConfirmationOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
          >
            <Send className="h-4 w-4" />
            Enviar recordatorios
          </button>
        </div>
      </div>

      <div className="glass overflow-hidden rounded-2xl shadow-xl">
        <div className="border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <p className="font-semibold text-white">Historial de envíos</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Correos de boletas, recibos, cobranzas y alertas operativas
            </p>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_240px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por email o asunto..."
                aria-label="Buscar comunicaciones por email o asunto"
                className="h-10 border-[var(--color-border)] bg-[var(--color-bg)] pl-9 text-white"
              />
            </div>

            <Select
              value={filterStatus}
              onValueChange={(value) => {
                setFilterStatus(value as DeliveryStatus | "ALL");
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 w-full border-[var(--color-border)] bg-[var(--color-bg)] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="ALL">Todos los estados</SelectItem>
                <SelectItem value="SENT">Enviado</SelectItem>
                <SelectItem value="FAILED">Fallido</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filterType}
              onValueChange={(value) => {
                setFilterType(value as CommunicationType | "ALL");
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 w-full border-[var(--color-border)] bg-[var(--color-bg)] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="ALL">Todos los tipos</SelectItem>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="h-10 px-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-white disabled:cursor-default disabled:opacity-40"
            >
              Limpiar Filtros
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-[var(--color-primary)] border-t-transparent" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center text-[var(--color-text-muted)]">
            No hay notificaciones registradas
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[var(--color-bg)]/50 text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="px-6 py-4">Fecha/Hora</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Destinatario</th>
                    <th className="px-6 py-4">Asunto</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Mensaje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {logs.map((log, index) => {
                    const StatusIcon = STATUS_ICON[log.status];

                    return (
                      <tr
                        key={log.id}
                        className="animate-fade-in transition-colors hover:bg-[var(--color-surface-hover)]"
                        style={{ animationDelay: `${index * 20}ms` }}
                      >
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                          {formatDateTime(log.createdAt)}
                        </td>
                        <td className="px-6 py-4">
                          <Badge className={TYPE_CLASS[log.type]}>
                            {TYPE_LABELS[log.type]}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium text-white">
                            {log.recipientEmail}
                          </p>
                          {log.recipientName && (
                            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                              {log.recipientName}
                            </p>
                          )}
                        </td>
                        <td className="max-w-sm px-6 py-4">
                          <p className="truncate text-sm text-white">
                            {log.subject}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            className={`${STATUS_CLASS[log.status]} gap-1`}
                          >
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {STATUS_LABELS[log.status]}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedLog(log)}
                            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-white transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]"
                          >
                            <MailOpen className="h-4 w-4" />
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-[var(--color-border)] px-6 py-4">
                <span className="text-sm text-[var(--color-text-muted)]">
                  Página {page} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                    className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-white transition-all hover:bg-[var(--color-surface-hover)] disabled:opacity-30"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                    className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-white transition-all hover:bg-[var(--color-surface-hover)] disabled:opacity-30"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Sheet
        open={selectedLog != null}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
      >
        <SheetContent>
          {selectedLog && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedLog.subject}</SheetTitle>
                <SheetDescription>
                  {TYPE_LABELS[selectedLog.type]} para{" "}
                  {selectedLog.recipientName
                    ? `${selectedLog.recipientName} (${selectedLog.recipientEmail})`
                    : selectedLog.recipientEmail}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 space-y-5 overflow-y-auto p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className={TYPE_CLASS[selectedLog.type]}>
                    {TYPE_LABELS[selectedLog.type]}
                  </Badge>
                  <Badge className={STATUS_CLASS[selectedLog.status]}>
                    {STATUS_LABELS[selectedLog.status]}
                  </Badge>
                  <span className="text-sm text-[var(--color-text-muted)]">
                    {formatDateTime(selectedLog.createdAt)}
                  </span>
                </div>

                {selectedLog.errorMessage && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                    <p className="text-sm font-semibold text-red-200">
                      Error de envío
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-red-100">
                      {selectedLog.errorMessage}
                    </p>
                  </div>
                )}

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Metadata de trazabilidad
                  </p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-secondary)]">
                    {selectedLog.metadata
                      ? JSON.stringify(selectedLog.metadata, null, 2)
                      : "Sin metadata adicional"}
                  </pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmActionModal
        open={reminderConfirmationOpen}
        onOpenChange={setReminderConfirmationOpen}
        title="Confirmar envío masivo"
        description="Se enviará un recordatorio automático a cada apoderado con cuotas vencidas. Cada intento quedará registrado en la bandeja de comunicaciones."
        variant="default"
        onConfirm={sendPaymentReminders}
        confirmLabel="Sí, enviar recordatorios"
        isLoading={sendingReminders}
      />
    </div>
  );
}
