"use client";

import { useMemo, useState } from "react";
import type { Student, Charge, PaymentConcept } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import {
  CheckCircle2,
  Calendar,
  AlertCircle,
  Trash2,
  Users,
  Plus,
  Zap,
  Clock,
  Sparkles,
  Wallet,
} from "lucide-react";

interface StudentChargesCardProps {
  student: Student;
  charges: Charge[];
  concepts?: PaymentConcept[];
  loadingCharges?: boolean;
  allocations: Array<{
    studentId: number;
    chargeId?: number;
    conceptId?: number;
    amount?: number;
  }>;
  onToggleCharge: (charge: Charge, checked: boolean) => void;
  onAmountChange: (chargeId: number, amount: number | undefined) => void;
  onAddCustomCredit?: (studentId: number, conceptId: number, amount: number) => void;
  onRemoveAllocation?: (index: number) => void;
  onSelectAllCharges: (studentId: number) => void;
  onSelectOverdueCharges: (studentId: number) => void;
  onClearCharges: (studentId: number) => void;
  onRemoveStudent: (studentId: number) => void;
  siblingSuggestions?: Student[];
  onAddSibling?: (sibling: Student) => void;
}

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

function formatChargeDate(date: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

function isChargeOverdue(dueDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  return due < today;
}

export function StudentChargesCard({
  student,
  charges,
  concepts = [],
  loadingCharges = false,
  allocations,
  onToggleCharge,
  onAmountChange,
  onAddCustomCredit,
  onSelectAllCharges,
  onSelectOverdueCharges,
  onClearCharges,
  onRemoveStudent,
  siblingSuggestions = [],
  onAddSibling,
}: StudentChargesCardProps) {
  const [showCustomCreditForm, setShowCustomCreditForm] = useState(false);
  const [customConceptId, setCustomConceptId] = useState<number | undefined>(
    concepts[0]?.id
  );
  const [customAmount, setCustomAmount] = useState<number | undefined>(undefined);

  // Map of chargeId -> allocated amount
  const allocationMap = useMemo(() => {
    const map = new Map<number, number>();
    allocations.forEach((a) => {
      if (a.chargeId != null && a.amount != null) {
        map.set(a.chargeId, a.amount);
      }
    });
    return map;
  }, [allocations]);

  // Standalone custom credits (allocations with chargeId === undefined)
  const customCreditAllocations = useMemo(() => {
    return allocations.filter((a) => a.chargeId == null);
  }, [allocations]);

  const activeChargesCount = allocationMap.size + customCreditAllocations.length;

  const totalSelectedAmount = useMemo(() => {
    return allocations.reduce((acc, a) => acc + (Number(a.amount) || 0), 0);
  }, [allocations]);

  const totalDebt = useMemo(() => {
    return charges.reduce((acc, c) => acc + Math.max(c.amount - c.paidAmount, 0), 0);
  }, [charges]);

  // Total overpayment / saldo a favor generated in this transaction
  const extraCreditGenerated = useMemo(() => {
    let extra = 0;
    // Overpayment on charges
    charges.forEach((c) => {
      const balance = Math.max(c.amount - c.paidAmount, 0);
      const allocated = allocationMap.get(c.id);
      if (allocated && allocated > balance) {
        extra += (allocated - balance);
      }
    });
    // Standalone custom credits
    customCreditAllocations.forEach((a) => {
      extra += (Number(a.amount) || 0);
    });
    return extra;
  }, [charges, allocationMap, customCreditAllocations]);

  const overdueCharges = useMemo(() => {
    return charges.filter(
      (c) => isChargeOverdue(c.dueDate) && c.amount - c.paidAmount > 0
    );
  }, [charges]);

  const handleAddCredit = () => {
    if (!customAmount || customAmount <= 0) return;
    const resolvedConceptId = customConceptId || concepts[0]?.id || 1;
    if (onAddCustomCredit) {
      onAddCustomCredit(student.id, resolvedConceptId, customAmount);
    }
    setCustomAmount(undefined);
    setShowCustomCreditForm(false);
  };

  return (
    <div className="glass rounded-2xl p-5 sm:p-6 space-y-5 border border-[var(--color-border)] shadow-lg transition-all animate-fade-in">
      {/* Header del Alumno */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]/70">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>{student.name}</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {student.course?.name ?? "Sin curso"}
            </span>
            <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-bg)]/80 px-2 py-0.5 rounded-md border border-[var(--color-border)]">
              {student.rut}
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Apoderado:{" "}
            <span className="text-white font-medium">
              {student.guardian?.name ?? "No asignado"}
            </span>
            {student.guardian?.phone && ` · 📞 ${student.guardian.phone}`}
            {student.guardian?.email && ` · ✉️ ${student.guardian.email}`}
          </p>
        </div>

        {/* Acciones del Alumno */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={() => onRemoveStudent(student.id)}
            className="p-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all text-xs font-medium flex items-center gap-1.5"
            title="Quitar alumno de este pago"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Quitar</span>
          </button>
        </div>
      </div>

      {/* Sugerencias de Hermanos */}
      {siblingSuggestions.length > 0 && onAddSibling && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-100">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Hermano(s) disponible(s):</strong>{" "}
              {siblingSuggestions.map((s) => `${s.name} (${s.course.name})`).join(", ")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {siblingSuggestions.map((sibling) => (
              <button
                key={sibling.id}
                type="button"
                onClick={() => onAddSibling(sibling)}
                className="px-2.5 py-1 rounded-lg font-medium bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-500/30 transition-all flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir {sibling.name.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Barra de Acciones Rápidas de Cuotas */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--color-bg)]/60 p-3 rounded-xl border border-[var(--color-border)]/50">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectAllCharges(student.id)}
            disabled={charges.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 transition-all flex items-center gap-1.5 disabled:opacity-40"
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Liquidar Deuda ({formatCLP(totalDebt)})</span>
          </button>

          {overdueCharges.length > 0 && (
            <button
              type="button"
              onClick={() => onSelectOverdueCharges(student.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30 transition-all flex items-center gap-1.5"
            >
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <span>Solo Vencidas ({overdueCharges.length})</span>
            </button>
          )}

          {activeChargesCount > 0 && (
            <button
              type="button"
              onClick={() => onClearCharges(student.id)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-muted)] hover:text-white hover:bg-[var(--color-surface-hover)] transition-all"
            >
              Desmarcar
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowCustomCreditForm((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 transition-all flex items-center gap-1"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>+ Abono Libre / Saldo a Favor</span>
          </button>
        </div>

        <div className="text-right flex items-center gap-3">
          <div className="text-right">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">
                Abono alumno:
              </span>
              <span className="text-base font-bold text-emerald-300 font-mono">
                {formatCLP(totalSelectedAmount)}
              </span>
            </div>
            {extraCreditGenerated > 0 && (
              <p className="text-[10px] text-emerald-400 font-medium flex items-center justify-end gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Incluye {formatCLP(extraCreditGenerated)} como saldo a favor
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Formulario desplegable para Añadir Abono Libre / Anticipo */}
      {showCustomCreditForm && (
        <div className="p-4 rounded-xl bg-blue-950/20 border border-blue-500/30 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              Registrar Abono Libre o Saldo a Favor Anticipado
            </span>
            <button
              type="button"
              onClick={() => setShowCustomCreditForm(false)}
              className="text-xs text-[var(--color-text-muted)] hover:text-white"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Concepto de Abono
              </label>
              <NativeSelectField>
                <select
                  value={customConceptId ?? ""}
                  onChange={(e) => setCustomConceptId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-white text-xs focus:border-blue-400 outline-none"
                >
                  {concepts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </NativeSelectField>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Monto del Abono ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)]">
                  $
                </span>
                <input
                  type="number"
                  min={1}
                  step={500}
                  placeholder="Ej. 25000"
                  value={customAmount ?? ""}
                  onChange={(e) =>
                    setCustomAmount(
                      e.target.value === "" ? undefined : Number(e.target.value)
                    )
                  }
                  className="w-full pl-7 pr-3 py-2 text-sm font-mono rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-white focus:border-blue-400 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleAddCredit}
              disabled={!customAmount || customAmount <= 0}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition-all disabled:opacity-40 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Añadir Abono a la Cuenta
            </button>
          </div>
        </div>
      )}

      {/* Lista de Cuotas Pendientes */}
      {loadingCharges ? (
        <div className="py-8 text-center text-sm text-[var(--color-text-muted)] flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          <span>Cargando cuotas del alumno...</span>
        </div>
      ) : charges.length === 0 && customCreditAllocations.length === 0 ? (
        <div className="py-6 text-center text-sm text-emerald-300/80 bg-emerald-500/5 rounded-xl border border-emerald-500/20 flex flex-col items-center gap-1">
          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          <span className="font-semibold">¡Sin cuotas pendientes!</span>
          <span className="text-xs text-[var(--color-text-muted)]">
            Puedes registrar un abono libre o saldo a favor si el apoderado desea transferir dinero anticipadamente.
          </span>
        </div>
      ) : (
        <div className="space-y-2.5">
          {charges.map((charge) => {
            const balance = Math.max(charge.amount - charge.paidAmount, 0);
            const isSelected = allocationMap.has(charge.id);
            const allocatedAmount = allocationMap.get(charge.id) ?? balance;
            const overdue = isChargeOverdue(charge.dueDate);
            const isPartial = allocatedAmount < balance;
            const isOverpayment = allocatedAmount > balance;
            const remainingBalance = Math.max(balance - allocatedAmount, 0);
            const overpaymentExtra = allocatedAmount - balance;

            return (
              <div
                key={charge.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  isSelected
                    ? "bg-blue-950/30 border-blue-500/40 shadow-sm ring-1 ring-blue-500/20"
                    : "bg-[var(--color-bg)]/40 border-[var(--color-border)] hover:border-[var(--color-border-subtle)]"
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Checkbox y Datos de la Cuota */}
                  <label className="flex items-start gap-3 cursor-pointer select-none min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => onToggleCharge(charge, e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-[var(--color-border)] text-blue-600 focus:ring-blue-500 bg-[var(--color-bg)] shrink-0"
                    />
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isSelected ? "text-white" : "text-[var(--color-text-secondary)]"
                          }`}
                        >
                          {charge.concept?.name ?? "Cuota"}
                        </span>
                        {overdue ? (
                          <Badge
                            variant="destructive"
                            className="text-[10px] px-1.5 py-0 gap-1 font-medium bg-red-500/20 text-red-200 border-red-500/30"
                          >
                            <AlertCircle className="w-2.5 h-2.5" />
                            Vencida
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 gap-1 text-[var(--color-text-muted)]"
                          >
                            <Clock className="w-2.5 h-2.5" />
                            Al día
                          </Badge>
                        )}
                        {charge.paidAmount > 0 && (
                          <span className="text-[10px] text-amber-300 font-mono">
                            (Abonado: {formatCLP(charge.paidAmount)})
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Vence: {formatChargeDate(charge.dueDate)}
                        </span>
                        <span>·</span>
                        <span>Saldo: <strong className="text-white">{formatCLP(balance)}</strong></span>
                      </div>
                    </div>
                  </label>

                  {/* Input de Monto a Pagar (Permite montos mayores para abono extra) */}
                  {isSelected && (
                    <div className="flex items-center gap-3 self-end md:self-center pl-7 md:pl-0">
                      <div className="space-y-1 text-right">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-[var(--color-text-muted)]">Pagar:</span>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)]">
                              $
                            </span>
                            <input
                              type="number"
                              min={1}
                              value={allocatedAmount === 0 ? "" : allocatedAmount}
                              onChange={(e) => {
                                const val = e.target.value === "" ? undefined : Number(e.target.value);
                                onAmountChange(charge.id, val);
                              }}
                              className="w-32 pl-6 pr-2.5 py-1.5 text-right font-mono text-sm font-semibold rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none transition-all"
                            />
                          </div>
                        </div>

                        {/* Indicador de Abono Parcial */}
                        {isPartial && (
                          <p className="text-[10px] text-amber-300 font-mono">
                            Quedará un saldo de {formatCLP(remainingBalance)}
                          </p>
                        )}

                        {/* Indicador de Abono Extra / Saldo a Favor */}
                        {isOverpayment && (
                          <p className="text-[10px] text-emerald-300 font-mono flex items-center justify-end gap-1 font-semibold">
                            <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                            +{formatCLP(overpaymentExtra)} a favor
                          </p>
                        )}
                      </div>

                      {/* Botón rápido para restaurar saldo exacto */}
                      {(isPartial || isOverpayment) && (
                        <button
                          type="button"
                          onClick={() => onAmountChange(charge.id, balance)}
                          className="px-2 py-1.5 rounded-lg text-[10px] bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 transition-colors"
                          title="Restaurar saldo exacto de la cuota"
                        >
                          Exacto
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Abonos Libres / Anticipos Adicionales */}
          {customCreditAllocations.map((credit, idx) => {
            const conceptObj = concepts.find((c) => c.id === credit.conceptId);
            return (
              <div
                key={`custom-credit-${idx}`}
                className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 flex items-center justify-between gap-3 animate-fade-in"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white truncate">
                        {conceptObj?.name ?? "Abono Libre a Cuenta"}
                      </span>
                      <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-500/30 text-[10px]">
                        Saldo a Favor
                      </Badge>
                    </div>
                    <span className="text-xs text-emerald-100/70">
                      Dinero extra para futuras cuotas del alumno
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono font-bold text-emerald-300">
                    +{formatCLP(Number(credit.amount) || 0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (onClearCharges) onClearCharges(student.id);
                    }}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Quitar este abono libre"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
