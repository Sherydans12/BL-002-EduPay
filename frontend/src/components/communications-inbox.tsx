"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Info,
  MailOpen,
  RefreshCw,
  Search,
  Send,
  Settings,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { communicationsApi } from "@/lib/api";
import type {
  CommunicationType,
  DeliveryStatus,
  SentCommunication,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { EmailTypesGuideModal } from "@/components/email-types-guide-modal";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

export function CommunicationsInbox() {
  const [communications, setCommunications] = useState<SentCommunication[]>([]);
  const [selected, setSelected] = useState<SentCommunication | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState<CommunicationType | "ALL">("ALL");
  const [status, setStatus] = useState<DeliveryStatus | "ALL">("ALL");
  const [reminderConfirmationOpen, setReminderConfirmationOpen] =
    useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [emailGuideOpen, setEmailGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [retryTarget, setRetryTarget] = useState<SentCommunication | null>(
    null,
  );
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchTerm]);

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

  const clearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setType("ALL");
    setStatus("ALL");
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
      await fetchCommunications();
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

  const retryCommunication = async () => {
    if (!retryTarget) return;

    setRetrying(true);
    try {
      await communicationsApi.retry(retryTarget.id);
      toast.success("Correo reenviado a la cola de Resend");
      setRetryTarget(null);
      await fetchCommunications();
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

  const hasActiveFilters =
    searchTerm.length > 0 || type !== "ALL" || status !== "ALL";

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-7xl space-y-6 pb-10 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Comunicaciones</h1>
            <p className="mt-1 text-[var(--color-text-secondary)]">
              Bandeja centralizada de correos enviados por EduPay
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text-secondary)]">
              <Send className="size-4 text-[var(--color-primary)]" />
              {total} registros
            </div>
            <button
              type="button"
              onClick={() => setEmailGuideOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              <Info className="size-4 text-[var(--color-primary)]" />
              Guía de Correos
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-surface-hover)]"
            >
              <Settings className="size-4 text-[var(--color-primary)]" />
              Configuración de Envíos
            </button>
            <button
              type="button"
              onClick={() => setReminderConfirmationOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
            >
              <Send className="size-4" />
              Enviar recordatorios
            </button>
          </div>
        </div>

        <section className="glass overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-xl">
          <header className="border-b border-[var(--color-border)] px-6 py-4">
            <p className="font-semibold text-white">Historial de envíos</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_240px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por email o asunto..."
                  aria-label="Buscar comunicaciones por email o asunto"
                  className="h-10 border-[var(--color-border)] bg-[var(--color-bg)] pl-9 text-white"
                />
              </div>

              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as CommunicationType | "ALL");
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

              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as DeliveryStatus | "ALL");
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-full border-[var(--color-border)] bg-[var(--color-bg)] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="ALL">Todos los estados</SelectItem>
                  <SelectItem value="SENT">Enviado a Resend</SelectItem>
                  <SelectItem value="DELIVERED">Entregado</SelectItem>
                  <SelectItem value="BOUNCED">Rebotado</SelectItem>
                  <SelectItem value="COMPLAINED">Marcado como spam</SelectItem>
                  <SelectItem value="FAILED">Fallido</SelectItem>
                </SelectContent>
              </Select>

              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="h-10 px-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-white disabled:cursor-default disabled:opacity-40"
              >
                Limpiar filtros
              </button>
            </div>
          </header>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="size-8 animate-spin rounded-full border-3 border-[var(--color-primary)] border-t-transparent" />
            </div>
          ) : communications.length === 0 ? (
            <div className="py-20 text-center text-[var(--color-text-muted)]">
              No hay comunicaciones para los filtros seleccionados.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="bg-[var(--color-bg)]/50 text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                      <th className="px-6 py-4">Fecha/Hora</th>
                      <th className="px-6 py-4">Destinatario</th>
                      <th className="px-6 py-4">Asunto</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4">Estado</th>
                      <th className="px-6 py-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {communications.map((communication) => {
                      const StatusIcon =
                        communication.status === "DELIVERED"
                          ? CheckCircle2
                          : communication.status === "FAILED" ||
                              communication.status === "BOUNCED" ||
                              communication.status === "COMPLAINED"
                            ? XCircle
                            : Send;
                      const statusBadge = (
                        <Badge
                          className={`${STATUS_CLASS[communication.status]} gap-1`}
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
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                            {formatDateTime(communication.createdAt)}
                          </td>
                          <td className="max-w-56 px-6 py-4">
                            <p className="truncate text-sm font-medium text-white">
                              {communication.recipientEmail}
                            </p>
                            {communication.recipientName ? (
                              <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                                {communication.recipientName}
                              </p>
                            ) : null}
                          </td>
                          <td className="max-w-sm px-6 py-4">
                            <p className="truncate text-sm text-white">
                              {communication.subject}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <Badge className={TYPE_CLASS[communication.type]}>
                              {TYPE_LABELS[communication.type]}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            {(communication.status === "FAILED" ||
                              communication.status === "BOUNCED") &&
                            communication.errorMessage ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>{statusBadge}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {communication.errorMessage}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              statusBadge
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {communication.status === "FAILED" ||
                              communication.status === "BOUNCED" ? (
                                <button
                                  type="button"
                                  onClick={() => setRetryTarget(communication)}
                                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
                                >
                                  <RefreshCw className="size-4" />
                                  Reintentar envío
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => setSelected(communication)}
                                className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-white transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]"
                              >
                                <MailOpen className="size-4" />
                                Ver detalle
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
                onPrev={() => setPage((current) => Math.max(1, current - 1))}
                onNext={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              />
            </>
          )}
        </section>

        <Sheet
          open={selected != null}
          onOpenChange={(open) => !open && setSelected(null)}
        >
          <SheetContent>
            {selected ? (
              <>
                <SheetHeader>
                  <SheetTitle>{selected.subject}</SheetTitle>
                  <SheetDescription>
                    {selected.recipientName
                      ? `${selected.recipientName} (${selected.recipientEmail})`
                      : selected.recipientEmail}
                  </SheetDescription>
                </SheetHeader>
                <div className="flex-1 space-y-5 overflow-y-auto p-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge className={TYPE_CLASS[selected.type]}>
                      {TYPE_LABELS[selected.type]}
                    </Badge>
                    <Badge className={STATUS_CLASS[selected.status]}>
                      {STATUS_LABEL[selected.status]}
                    </Badge>
                    <span className="text-sm text-[var(--color-text-muted)]">
                      {formatDateTime(selected.createdAt)}
                    </span>
                  </div>
                  {selected.errorMessage ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                      <p className="font-semibold text-red-200">
                        Error de envío
                      </p>
                      <p className="mt-2 whitespace-pre-wrap">
                        {selected.errorMessage}
                      </p>
                    </div>
                  ) : null}
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Metadata de trazabilidad
                    </p>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm leading-6 text-[var(--color-text-secondary)]">
                      {selected.metadata
                        ? JSON.stringify(selected.metadata, null, 2)
                        : "Sin metadata adicional"}
                    </pre>
                  </div>
                </div>
              </>
            ) : null}
          </SheetContent>
        </Sheet>

        <EmailTypesGuideModal
          open={emailGuideOpen}
          onOpenChange={setEmailGuideOpen}
        />

        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white">
                Configuración de Envíos
              </DialogTitle>
              <DialogDescription className="text-[var(--color-text-secondary)]">
                Próximamente podrás administrar remitentes, reglas de envío y
                preferencias de notificación desde este espacio.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-5 text-sm text-[var(--color-text-muted)]">
              La configuración avanzada de Resend estará disponible en una
              siguiente etapa.
            </div>
          </DialogContent>
        </Dialog>

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

        <ConfirmActionModal
          open={retryTarget != null}
          onOpenChange={(open) => !open && setRetryTarget(null)}
          title="Reintentar envío de correo"
          description={`¿Deseas reintentar el envío de este correo a ${retryTarget?.recipientEmail ?? "este destinatario"}?`}
          variant="default"
          onConfirm={retryCommunication}
          confirmLabel="Sí, reintentar envío"
          isLoading={retrying}
        />
      </div>
    </TooltipProvider>
  );
}
