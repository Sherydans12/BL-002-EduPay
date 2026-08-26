"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Printer,
  PlusCircle,
  History,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { METHOD_LABELS } from "@/lib/payment-method-labels";
import type { PaymentMethod } from "@/lib/api";

export interface ReceiptData {
  groupId?: number;
  paymentDate: string;
  totalAmount: number;
  method: PaymentMethod;
  referenceCode?: string;
  boletaNumber?: string;
  isBoletaPending?: boolean;
  payerName?: string;
  guardianName?: string;
  notes?: string;
  items: Array<{
    studentName: string;
    courseName?: string;
    rut?: string;
    conceptName: string;
    amount: number;
  }>;
}

interface PaymentReceiptModalProps {
  open: boolean;
  onClose: () => void;
  onNewPayment?: () => void;
  receiptData: ReceiptData | null;
}

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T12:00:00"));
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function PaymentReceiptModal({
  open,
  onClose,
  onNewPayment,
  receiptData,
}: PaymentReceiptModalProps) {
  const router = useRouter();

  const handlePrint = () => {
    window.print();
  };

  const groupedByStudent = useMemo(() => {
    if (!receiptData) return [];
    const map = new Map<
      string,
      {
        studentName: string;
        courseName?: string;
        rut?: string;
        charges: Array<{ conceptName: string; amount: number }>;
        subtotal: number;
      }
    >();

    receiptData.items.forEach((item) => {
      const key = `${item.studentName}-${item.rut}`;
      if (!map.has(key)) {
        map.set(key, {
          studentName: item.studentName,
          courseName: item.courseName,
          rut: item.rut,
          charges: [],
          subtotal: 0,
        });
      }
      const entry = map.get(key)!;
      entry.charges.push({
        conceptName: item.conceptName,
        amount: item.amount,
      });
      entry.subtotal += item.amount;
    });

    return Array.from(map.values());
  }, [receiptData]);

  if (!receiptData) return null;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-2xl md:max-w-3xl w-full max-w-[calc(100vw-2rem)] p-0 overflow-hidden bg-[var(--color-surface)] border-[var(--color-border)] text-white shadow-2xl">
        {/* Cabecera de Éxito */}
        <div className="bg-gradient-to-r from-emerald-600/30 via-emerald-500/20 to-transparent p-6 border-b border-emerald-500/30 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-lg shadow-emerald-500/20 shrink-0">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
              <span>¡Pago Registrado con Éxito!</span>
              {receiptData.groupId && (
                <span className="text-xs font-mono bg-emerald-500/20 text-emerald-200 px-2 py-0.5 rounded border border-emerald-500/40">
                  #{receiptData.groupId}
                </span>
              )}
            </DialogTitle>
            <p className="text-xs text-emerald-100/80 mt-0.5">
              La transacción ha sido guardada y los saldos fueron actualizados en la cuenta corriente.
            </p>
          </div>
        </div>

        {/* Contenido del Comprobante (Imprimible) */}
        <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto print:max-h-none print:overflow-visible" id="printable-receipt">
          {/* Ficha Resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[var(--color-bg)]/80 border border-[var(--color-border)] text-xs">
            <div>
              <span className="text-[var(--color-text-muted)] block uppercase tracking-wider text-[10px]">
                Fecha de Pago
              </span>
              <span className="font-semibold text-white mt-0.5 block">
                {formatDate(receiptData.paymentDate)}
              </span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)] block uppercase tracking-wider text-[10px]">
                Método
              </span>
              <span className="font-semibold text-white mt-0.5 block">
                {METHOD_LABELS[receiptData.method] || receiptData.method}
              </span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)] block uppercase tracking-wider text-[10px]">
                Pagador / Apoderado
              </span>
              <span className="font-semibold text-white mt-0.5 block truncate">
                {receiptData.payerName || receiptData.guardianName || "No registrado"}
              </span>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)] block uppercase tracking-wider text-[10px]">
                Estado Boleta
              </span>
              <div className="mt-0.5">
                {receiptData.isBoletaPending ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300">
                    <AlertTriangle className="w-3 h-3" />
                    Pendiente
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                    <FileText className="w-3 h-3" />
                    {receiptData.boletaNumber ? `N° ${receiptData.boletaNumber}` : "Emitida"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {receiptData.referenceCode && (
            <div className="px-3.5 py-2 rounded-lg bg-[var(--color-bg)]/50 border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] flex items-center justify-between">
              <span>Referencia / Operación:</span>
              <strong className="text-white font-mono">{receiptData.referenceCode}</strong>
            </div>
          )}

          {/* Desglose de Alumnos y Cuotas */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              Detalle de Asignaciones ({groupedByStudent.length} alumno{groupedByStudent.length > 1 ? "s" : ""})
            </h4>

            <div className="space-y-3">
              {groupedByStudent.map((st, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 overflow-hidden"
                >
                  <div className="px-4 py-2.5 bg-[var(--color-bg)]/80 border-b border-[var(--color-border)]/70 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-white">{st.studentName}</span>
                      {st.courseName && (
                        <span className="text-xs text-[var(--color-text-muted)] ml-2">
                          ({st.courseName})
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono font-semibold text-emerald-300">
                      Subtotal: {formatCLP(st.subtotal)}
                    </span>
                  </div>

                  <div className="p-3 divide-y divide-[var(--color-border)]/40 text-xs">
                    {st.charges.map((ch, cIdx) => (
                      <div key={cIdx} className="py-1.5 flex items-center justify-between">
                        <span className="text-[var(--color-text-secondary)]">
                          {ch.conceptName}
                        </span>
                        <span className="font-mono font-medium text-white">
                          {formatCLP(ch.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totalizador */}
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-100">
              Monto Total Pagado:
            </span>
            <span className="text-2xl font-bold font-mono text-emerald-300">
              {formatCLP(receiptData.totalAmount)}
            </span>
          </div>
        </div>

        {/* Footer con Acciones */}
        <DialogFooter className="p-4 bg-[var(--color-bg)]/90 border-t border-[var(--color-border)] flex flex-col sm:flex-row gap-2 sm:justify-between items-center">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onNewPayment ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push("/pagos")}
                className="gap-2 text-xs flex-1 sm:flex-initial"
              >
                <History className="w-4 h-4" />
                Ver en Historial
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="gap-2 text-xs text-[var(--color-text-secondary)] hover:text-white"
              >
                Cerrar
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrint}
              className="gap-2 text-xs border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 flex-1 sm:flex-initial"
            >
              <Printer className="w-4 h-4" />
              Imprimir Comprobante
            </Button>

            {onNewPayment ? (
              <Button
                type="button"
                onClick={onNewPayment}
                className="gap-2 text-xs bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white flex-1 sm:flex-initial"
              >
                <PlusCircle className="w-4 h-4" />
                Registrar Otro Pago
              </Button>
            ) : (
              <Button
                type="button"
                onClick={onClose}
                className="gap-2 text-xs bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white flex-1 sm:flex-initial"
              >
                Listo
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
