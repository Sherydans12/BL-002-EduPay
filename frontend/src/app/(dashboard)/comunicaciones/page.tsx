"use client";

import { useCallback, useEffect, useState } from "react";
import { MailOpen, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { notificationsApi } from "@/lib/api";
import type {
  NotificationLog,
  NotificationStatus,
  NotificationType,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const TYPE_LABELS: Record<NotificationType, string> = {
  BOLETA_DELIVERY: "Boleta",
  PAYMENT_RECEIPT: "Recibo",
  COBRANZA_PREVENTIVA: "Cobranza preventiva",
  COBRANZA_MORA: "Cobranza mora",
};

const TYPE_CLASS: Record<NotificationType, string> = {
  BOLETA_DELIVERY: "border-blue-500/30 bg-blue-500/15 text-blue-300",
  PAYMENT_RECEIPT: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  COBRANZA_PREVENTIVA: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  COBRANZA_MORA: "border-red-500/30 bg-red-500/15 text-red-300",
};

const STATUS_LABELS: Record<NotificationStatus, string> = {
  PENDING: "Pendiente",
  SENT: "Enviado",
  FAILED: "Fallido",
};

const STATUS_CLASS: Record<NotificationStatus, string> = {
  SENT: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  FAILED: "border-red-500/30 bg-red-500/15 text-red-300",
  PENDING: "border-yellow-500/30 bg-yellow-500/15 text-yellow-300",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function isHtmlBody(body: string) {
  return /<\/?[a-z][\s\S]*>/i.test(body);
}

export default function ComunicacionesPage() {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<NotificationLog | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.getAll({
        page: page.toString(),
        limit: "20",
      });
      setLogs(res.data);
      setTotalPages(res.meta.totalPages ?? res.meta.lastPage ?? 1);
      setTotalCount(res.meta.total);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Error al cargar comunicaciones",
      );
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const selectedIsHtml = selectedLog ? isHtmlBody(selectedLog.body) : false;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Comunicaciones</h1>
          <p className="mt-1 text-[var(--color-text-secondary)]">
            Bandeja centralizada de correos enviados por EduPay
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text-secondary)]">
          <Send className="h-4 w-4 text-[var(--color-primary)]" />
          {totalCount} registros
        </div>
      </div>

      <div className="glass overflow-hidden rounded-2xl shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <p className="font-semibold text-white">Historial de envíos</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Correos de boletas, recibos, cobranzas y alertas operativas
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-lg bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text-muted)] sm:flex">
            <Search className="h-3.5 w-3.5" />
            Ordenado por fecha descendente
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
                  {logs.map((log, index) => (
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
                        {log.student && (
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {log.student.name}
                          </p>
                        )}
                      </td>
                      <td className="max-w-sm px-6 py-4">
                        <p className="truncate text-sm text-white">
                          {log.subject}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={STATUS_CLASS[log.status]}>
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
                          Ver Mensaje
                        </button>
                      </td>
                    </tr>
                  ))}
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
                  {TYPE_LABELS[selectedLog.type]} enviado a{" "}
                  {selectedLog.recipientEmail}
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

                <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
                  {selectedIsHtml ? (
                    <iframe
                      title="Mensaje enviado"
                      sandbox=""
                      srcDoc={selectedLog.body}
                      className="h-[70vh] w-full bg-white"
                    />
                  ) : (
                    <pre className="min-h-[360px] whitespace-pre-wrap p-5 text-sm leading-6 text-slate-900">
                      {selectedLog.body}
                    </pre>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
