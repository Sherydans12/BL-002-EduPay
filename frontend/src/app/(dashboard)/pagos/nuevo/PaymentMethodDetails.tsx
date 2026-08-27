"use client";

import { useState, useEffect } from "react";
import { formatNumberCLP, parseCLP } from "@/lib/currency-utils";
import type { PaymentMethod } from "@/lib/api";
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import {
  Banknote,
  CreditCard,
  Building2,
  Receipt,
  FileCheck2,
  Calculator,
  ArrowRight,
} from "lucide-react";

export type ManualPaymentMethod =
  | "CASH"
  | "DEBIT"
  | "CREDIT"
  | "CHECK"
  | "TRANSFER";

export interface PaymentMethodDetailsProps {
  method: ManualPaymentMethod;
  onChangeMethod: (method: ManualPaymentMethod) => void;
  totalAmount: number;
  referenceCode: string;
  onChangeReferenceCode: (code: string) => void;
  notes: string;
  onChangeNotes: (notes: string) => void;
}

const CHILEAN_BANKS = [
  "BancoEstado",
  "Banco de Chile / Edwards",
  "Banco Santander",
  "BCI",
  "Scotiabank",
  "Banco Itaú",
  "Banco Falabella",
  "Banco BICE",
  "Banco Security",
  "Banco Consorcio",
  "Tenpo",
  "MACH",
  "Mercado Pago",
  "Coopeuch",
  "Otro",
];

const METHODS_LIST: Array<{
  value: ManualPaymentMethod;
  label: string;
  icon: typeof Banknote;
  description: string;
}> = [
  {
    value: "CASH",
    label: "Efectivo",
    icon: Banknote,
    description: "Pago en ventanilla con billetes/monedas",
  },
  {
    value: "DEBIT",
    label: "Débito",
    icon: CreditCard,
    description: "Tarjeta de débito / Redcompra POS",
  },
  {
    value: "CREDIT",
    label: "Crédito",
    icon: CreditCard,
    description: "Tarjeta de crédito comercial",
  },
  {
    value: "TRANSFER",
    label: "Transferencia",
    icon: Building2,
    description: "Transferencia electrónica bancaria",
  },
  {
    value: "CHECK",
    label: "Cheque",
    icon: FileCheck2,
    description: "Cheque al día o a fecha",
  },
];

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

export function PaymentMethodDetails({
  method,
  onChangeMethod,
  totalAmount,
  referenceCode,
  onChangeReferenceCode,
  notes,
  onChangeNotes,
}: PaymentMethodDetailsProps) {
  // Cash calculator state
  const [cashReceived, setCashReceived] = useState<number | undefined>(undefined);
  const [selectedBank, setSelectedBank] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [checkBank, setCheckBank] = useState("");
  const [checkDueDate, setCheckDueDate] = useState("");

  // Sync reference code based on method fields
  useEffect(() => {
    if (method === "TRANSFER") {
      const parts = [];
      if (selectedBank) parts.push(`Banco: ${selectedBank}`);
      if (authCode) parts.push(`Op: ${authCode}`);
      if (parts.length > 0) {
        onChangeReferenceCode(parts.join(" · "));
      }
    } else if (method === "DEBIT" || method === "CREDIT") {
      if (authCode) {
        onChangeReferenceCode(`Auth POS: ${authCode}`);
      }
    } else if (method === "CHECK") {
      const parts = [];
      if (checkNumber) parts.push(`N° Cheque: ${checkNumber}`);
      if (checkBank) parts.push(`Banco: ${checkBank}`);
      if (checkDueDate) parts.push(`Cobro: ${checkDueDate}`);
      if (parts.length > 0) {
        onChangeReferenceCode(parts.join(" · "));
      }
    }
  }, [method, selectedBank, authCode, checkNumber, checkBank, checkDueDate, onChangeReferenceCode]);

  const changeDue = (cashReceived ?? 0) - totalAmount;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Botones de Selección Visual de Método */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {METHODS_LIST.map((m) => {
          const Icon = m.icon;
          const isSelected = method === m.value;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => onChangeMethod(m.value)}
              className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-center ${
                isSelected
                  ? "bg-blue-600/25 border-blue-500 text-white shadow-md shadow-blue-500/15 ring-1 ring-blue-500/40"
                  : "bg-[var(--color-bg)]/80 border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-surface-hover)]"
              }`}
            >
              <Icon className={`w-5 h-5 ${isSelected ? "text-blue-400" : "text-[var(--color-text-muted)]"}`} />
              <span className="text-xs font-semibold">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Contenido Contextual por Método */}
      {method === "CASH" && (
        <div className="p-4 rounded-xl bg-[var(--color-bg)]/80 border border-[var(--color-border)] space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--color-text-secondary)] flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-blue-400" />
              Calculadora de Vuelto
            </span>
            <button
              type="button"
              onClick={() => setCashReceived(totalAmount)}
              className="text-[11px] text-blue-300 hover:underline font-medium"
            >
              Monto exacto
            </button>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)]">
                $
              </span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Monto recibido (ej. 100.000)"
                value={cashReceived ? formatNumberCLP(cashReceived) : ""}
                onChange={(e) => {
                  const val = parseCLP(e.target.value);
                  setCashReceived(val > 0 ? val : undefined);
                }}
                className="w-full pl-8 pr-4 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-sm font-mono focus:border-blue-400 outline-none"
              />
            </div>

            {/* Chips de Billetes Rápidos */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[10000, 20000, 50000, 100000].map((bill) => (
                <button
                  key={bill}
                  type="button"
                  onClick={() => setCashReceived((prev) => (prev ?? 0) + bill)}
                  className="px-2 py-1 rounded-md text-[11px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white hover:border-blue-400 transition-all font-mono"
                >
                  +{formatCLP(bill)}
                </button>
              ))}
              {cashReceived !== undefined && (
                <button
                  type="button"
                  onClick={() => setCashReceived(undefined)}
                  className="px-2 py-1 rounded-md text-[11px] text-red-400 hover:bg-red-500/10 transition-all"
                >
                  Borrar
                </button>
              )}
            </div>

            {/* Resultado del Vuelto */}
            {cashReceived !== undefined && cashReceived > 0 && (
              <div
                className={`p-3 rounded-lg flex items-center justify-between border ${
                  changeDue >= 0
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-red-500/10 border-red-500/30 text-red-300"
                }`}
              >
                <div className="text-xs">
                  {changeDue >= 0 ? "Vuelto a entregar:" : "Faltan por cobrar:"}
                </div>
                <div className="text-base font-bold font-mono">
                  {formatCLP(Math.abs(changeDue))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {method === "TRANSFER" && (
        <div className="p-4 rounded-xl bg-[var(--color-bg)]/80 border border-[var(--color-border)] space-y-3 animate-fade-in">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              Banco de Origen (Opcional)
            </label>
            <NativeSelectField>
              <select
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-xs focus:border-blue-400 outline-none"
              >
                <option value="">Seleccionar banco...</option>
                {CHILEAN_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </NativeSelectField>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              N° de Operación / Transferencia (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej. TRX-982341 o últimos 6 dígitos"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-xs focus:border-blue-400 outline-none"
            />
          </div>
        </div>
      )}

      {(method === "DEBIT" || method === "CREDIT") && (
        <div className="p-4 rounded-xl bg-[var(--color-bg)]/80 border border-[var(--color-border)] space-y-3 animate-fade-in">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              Código de Autorización / Voucher POS (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej. 084920 (Transbank / Getnet)"
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-xs focus:border-blue-400 outline-none"
            />
          </div>
        </div>
      )}

      {method === "CHECK" && (
        <div className="p-4 rounded-xl bg-[var(--color-bg)]/80 border border-[var(--color-border)] space-y-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                N° de Cheque (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. 1092834"
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-xs focus:border-blue-400 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                Banco (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. Banco de Chile"
                value={checkBank}
                onChange={(e) => setCheckBank(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-xs focus:border-blue-400 outline-none"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              Fecha de Cobro / Vencimiento (Opcional)
            </label>
            <input
              type="date"
              value={checkDueDate}
              onChange={(e) => setCheckDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-xs focus:border-blue-400 outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
