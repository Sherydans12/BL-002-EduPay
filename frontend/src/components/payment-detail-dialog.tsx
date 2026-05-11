"use client";

import type { ReactNode } from "react";
import type { Payment } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatPaymentDate } from "@/lib/format-payment-date";
import { METHOD_LABELS } from "@/lib/payment-method-labels";
import { FileText, Download } from "lucide-react";

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5 py-3 border-b border-[var(--color-border)] last:border-b-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </p>
      <div className="text-sm text-white break-words">{children}</div>
    </div>
  );
}

export type PaymentDetailDialogProps = {
  payment: Payment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBaseUrl: string;
};

export function PaymentDetailDialog({
  payment,
  open,
  onOpenChange,
  apiBaseUrl,
}: PaymentDetailDialogProps) {
  const g = payment?.student.guardian;
  const methodLabel = payment
    ? METHOD_LABELS[payment.method] || payment.method
    : "";

  return (
    <Dialog open={open && !!payment} onOpenChange={onOpenChange}>
      {payment ? (
      <DialogContent
        showCloseButton
        className="sm:max-w-lg max-h-[min(90vh,720px)] overflow-y-auto gap-0 p-0"
      >
        <DialogHeader className="px-5 pt-5 pb-2 pr-12">
          <DialogTitle className="text-lg text-white">
            Pago #{payment.id}
          </DialogTitle>
          <DialogDescription className="text-[var(--color-text-muted)]">
            Fecha de pago: {formatPaymentDate(payment.paymentDate)} · Registrado:{" "}
            {formatDateTime(payment.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-1">
          <DetailBlock label="Monto">
            <span className="text-2xl font-bold text-emerald-400 tabular-nums">
              ${payment.amount.toLocaleString("es-CL")}
            </span>
          </DetailBlock>

          <DetailBlock label="Método de pago">
            <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--color-primary-light)] text-blue-300">
              {methodLabel}
            </span>
          </DetailBlock>

          <DetailBlock label="Concepto / arancel">
            {payment.concept?.name ?? (
              <span className="text-[var(--color-text-muted)]">Sin concepto asociado</span>
            )}
          </DetailBlock>

          <DetailBlock label="Alumno">
            <p className="font-medium">{payment.student.name}</p>
            <p className="text-[var(--color-text-secondary)] text-xs mt-0.5">
              RUT {payment.student.rut}
            </p>
            <p className="text-[var(--color-text-secondary)] text-xs mt-1">
              Curso: {payment.student.course?.name ?? "—"}
            </p>
          </DetailBlock>

          <DetailBlock label="Apoderado">
            {g ? (
              <>
                <p className="font-medium">{g.name}</p>
                <ul className="mt-1 space-y-0.5 text-xs text-[var(--color-text-secondary)]">
                  {g.rut ? <li>RUT {g.rut}</li> : null}
                  {g.email ? <li>{g.email}</li> : null}
                  {g.phone ? <li>{g.phone}</li> : null}
                  {!g.rut && !g.email && !g.phone ? (
                    <li className="text-[var(--color-text-muted)]">Sin datos adicionales</li>
                  ) : null}
                </ul>
              </>
            ) : (
              <span className="text-[var(--color-text-muted)]">—</span>
            )}
          </DetailBlock>

          <DetailBlock label="Pagador (si distinto del apoderado)">
            {payment.payerName ? (
              <>
                <p className="font-medium">{payment.payerName}</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  {payment.payerRut ? `RUT ${payment.payerRut}` : "Sin RUT indicado"}
                </p>
              </>
            ) : (
              <span className="text-[var(--color-text-muted)] italic">
                Se asume apoderado del alumno
              </span>
            )}
          </DetailBlock>

          <DetailBlock label="Código de referencia">
            {payment.referenceCode?.trim() ? (
              <span className="font-mono text-[var(--color-text-secondary)]">
                {payment.referenceCode}
              </span>
            ) : (
              <span className="text-[var(--color-text-muted)]">—</span>
            )}
          </DetailBlock>

          <DetailBlock label="Notas">
            {payment.notes?.trim() ? (
              <p className="whitespace-pre-wrap text-[var(--color-text-secondary)]">
                {payment.notes}
              </p>
            ) : (
              <span className="text-[var(--color-text-muted)]">—</span>
            )}
          </DetailBlock>

          <DetailBlock label="Comprobante / boleta">
            {payment.boletaFileUrl ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="text-sm">
                  {payment.boletaNumber ? (
                    <p>
                      N° <span className="font-mono">{payment.boletaNumber}</span>
                    </p>
                  ) : (
                    <p className="text-[var(--color-text-muted)]">Archivo adjunto</p>
                  )}
                </div>
                <a
                  href={`${apiBaseUrl}${payment.boletaFileUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 w-fit px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 text-xs font-medium border border-slate-700 hover:border-blue-500/30 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Abrir PDF
                  <Download className="w-3 h-3 opacity-70" />
                </a>
              </div>
            ) : (
              <span className="text-[var(--color-text-muted)]">Sin comprobante</span>
            )}
          </DetailBlock>
        </div>
      </DialogContent>
      ) : null}
    </Dialog>
  );
}
