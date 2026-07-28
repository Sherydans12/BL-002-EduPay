"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUp, Paperclip, Upload } from "lucide-react";
import { toast } from "sonner";
import { paymentsApi } from "@/lib/api";
import type { PaymentGroup } from "@/lib/api";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TablePagination } from "@/components/ui/table-pagination";
import { formatPaymentDate } from "@/lib/format-payment-date";
import { METHOD_LABELS } from "@/lib/payment-method-labels";

const inputClass =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)]";

type PendingBoletasTableProps = {
  onAttached?: () => void | Promise<void>;
  onTotalChange?: (total: number) => void;
};

function paymentGroupLabel(group: PaymentGroup): string {
  return group.buyOrder?.trim() || `#${group.id}`;
}

function getGuardians(group: PaymentGroup) {
  return Array.from(
    new Map(
      group.payments.map((payment) => [
        payment.student.guardian?.id ?? payment.student.guardianId,
        payment.student.guardian,
      ]),
    ).values(),
  ).filter(Boolean);
}

export function PendingBoletasTable({
  onAttached,
  onTotalChange,
}: PendingBoletasTableProps) {
  const [groups, setGroups] = useState<PaymentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedGroup, setSelectedGroup] = useState<PaymentGroup | null>(null);
  const [boletaFile, setBoletaFile] = useState<File | null>(null);
  const [boletaFileUrl, setBoletaFileUrl] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);

  const fetchPendingBoletas = useCallback(async () => {
    setLoading(true);
    try {
      const response = await paymentsApi.getGroups({
        page: String(page),
        limit: "20",
        isBoletaPending: "true",
      });
      setGroups(response.data);
      setTotal(response.meta.total);
      setTotalPages(response.meta.totalPages ?? response.meta.lastPage ?? 1);
      onTotalChange?.(response.meta.total);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible cargar las boletas pendientes",
      );
    } finally {
      setLoading(false);
    }
  }, [onTotalChange, page]);

  useEffect(() => {
    void fetchPendingBoletas();
  }, [fetchPendingBoletas]);

  const recipientEmails = useMemo(() => {
    if (!selectedGroup) return [];

    return Array.from(
      new Set(
        getGuardians(selectedGroup)
          .map((guardian) => guardian?.email?.trim())
          .filter((email): email is string => Boolean(email)),
      ),
    );
  }, [selectedGroup]);

  const openAttachmentDialog = (group: PaymentGroup) => {
    setSelectedGroup(group);
    setBoletaFile(null);
    setBoletaFileUrl("");
  };

  const closeAttachmentDialog = () => {
    if (attaching) return;
    setConfirmOpen(false);
    setSelectedGroup(null);
    setBoletaFile(null);
    setBoletaFileUrl("");
  };

  const requestAttachmentConfirmation = () => {
    if (!boletaFile && !boletaFileUrl.trim()) {
      toast.error("Adjunta un PDF o ingresa la URL pública de la boleta");
      return;
    }

    setConfirmOpen(true);
  };

  const attachBoleta = async () => {
    if (!selectedGroup) return;

    setAttaching(true);
    try {
      await paymentsApi.attachBoleta(selectedGroup.id, {
        boleta: boletaFile ?? undefined,
        boletaFileUrl: boletaFile
          ? undefined
          : boletaFileUrl.trim() || undefined,
      });
      toast.success("Boleta adjuntada y correo automático iniciado");
      setConfirmOpen(false);
      setSelectedGroup(null);
      setBoletaFile(null);
      setBoletaFileUrl("");
      await Promise.all([fetchPendingBoletas(), onAttached?.()]);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible adjuntar la boleta",
      );
    } finally {
      setAttaching(false);
    }
  };

  const selectedLabel = selectedGroup
    ? selectedGroup.buyOrder?.trim() || String(selectedGroup.id)
    : "";
  const formattedAmount = selectedGroup
    ? `$${selectedGroup.totalAmount.toLocaleString("es-CL")}`
    : "$0";

  return (
    <>
      <section className="glass overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-xl">
        <header className="border-b border-[var(--color-border)] px-6 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-300">
              <FileUp className="size-4" />
            </span>
            <div>
              <h2 className="font-semibold text-white">Boletas pendientes</h2>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Pagos que requieren respaldo PDF o URL antes de notificar al
                apoderado.
              </p>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="size-8 animate-spin rounded-full border-3 border-[var(--color-primary)] border-t-transparent" />
          </div>
        ) : groups.length === 0 ? (
          <div className="px-6 py-20 text-center text-[var(--color-text-muted)]">
            No hay boletas pendientes.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-[var(--color-bg)]/50 text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="px-6 py-4">Orden de compra</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Apoderado</th>
                    <th className="px-6 py-4">Alumno</th>
                    <th className="px-6 py-4">Monto</th>
                    <th className="px-6 py-4">Método</th>
                    <th className="px-6 py-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {groups.map((group) => {
                    const guardians = getGuardians(group);
                    const guardianLabel = guardians
                      .map((guardian) => guardian?.name)
                      .filter(Boolean)
                      .join(", ");

                    return (
                      <tr
                        key={group.id}
                        className="transition-colors hover:bg-[var(--color-surface-hover)]"
                      >
                        <td className="px-6 py-4 text-sm font-medium text-white">
                          {paymentGroupLabel(group)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                          {formatPaymentDate(group.paymentDate)}
                        </td>
                        <td className="max-w-48 px-6 py-4">
                          <p className="truncate text-sm text-white">
                            {guardianLabel || "Sin apoderado"}
                          </p>
                          <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                            {guardians
                              .map((guardian) => guardian?.email)
                              .filter(Boolean)
                              .join(", ") || "Sin correo registrado"}
                          </p>
                        </td>
                        <td className="max-w-52 px-6 py-4 text-sm text-white">
                          {group.payments
                            .map((payment) => payment.student.name)
                            .join(", ")}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold tabular-nums text-emerald-400">
                          ${group.totalAmount.toLocaleString("es-CL")}
                        </td>
                        <td className="px-6 py-4">
                          <span className="rounded-lg bg-[var(--color-primary-light)] px-2.5 py-1 text-xs font-semibold text-blue-300">
                            {METHOD_LABELS[group.method] || group.method}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => openAttachmentDialog(group)}
                            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
                          >
                            <Paperclip className="size-4" />
                            Adjuntar boleta
                          </button>
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

      <Dialog
        open={selectedGroup != null}
        onOpenChange={(open) => !open && closeAttachmentDialog()}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adjuntar boleta</DialogTitle>
            <DialogDescription>
              Carga el PDF o pega una URL pública para el pago {selectedLabel}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Archivo PDF
              </label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  setBoletaFile(event.target.files?.[0] ?? null);
                  if (event.target.files?.[0]) setBoletaFileUrl("");
                }}
                className={`${inputClass} file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-[var(--color-primary-hover)]`}
              />
            </div>

            <div className="relative py-1 text-center before:absolute before:inset-x-0 before:top-1/2 before:border-t before:border-[var(--color-border)]">
              <span className="relative bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text-muted)]">
                o usa una URL
              </span>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                URL pública del PDF
              </label>
              <input
                type="url"
                value={boletaFileUrl}
                onChange={(event) => {
                  setBoletaFileUrl(event.target.value);
                  if (event.target.value) setBoletaFile(null);
                }}
                placeholder="https://archivos.colegio.cl/boleta.pdf"
                className={inputClass}
              />
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={closeAttachmentDialog}
              disabled={attaching}
              className="px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={requestAttachmentConfirmation}
              disabled={attaching}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              <Upload className="size-4" />
              Continuar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionModal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar adjunto de boleta"
        description={
          <div className="space-y-3">
            <p>
              Vas a adjuntar la boleta al pago #{selectedLabel} por{" "}
              {formattedAmount}.
            </p>
            <p>
              Esta acción marcará la boleta como resuelta y enviará un correo
              automático inmediatamente a:{" "}
              {recipientEmails.join(", ") || "el apoderado registrado"}.
            </p>
          </div>
        }
        variant="default"
        onConfirm={attachBoleta}
        confirmLabel="Sí, adjuntar y notificar"
        isLoading={attaching}
      />
    </>
  );
}
