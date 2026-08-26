"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import { Badge } from "@/components/ui/badge";
import {
  communicationsApi,
  type Course,
  type RemindersPreviewResponse,
} from "@/lib/api";
import { fetchAllCourses } from "@/lib/fetch-all-pages";
import { formatCLP } from "@/lib/currency-utils";
import { toast } from "sonner";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Mail,
  Send,
  Users,
} from "lucide-react";

interface PaymentRemindersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}

export function PaymentRemindersModal({
  open,
  onOpenChange,
  onSent,
}: PaymentRemindersModalProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [preview, setPreview] = useState<RemindersPreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [expandedStudentId, setExpandedStudentId] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    fetchAllCourses().then(setCourses).catch(() => {});
  }, [open]);

  const loadPreview = useCallback(async () => {
    if (!open) return;
    setLoadingPreview(true);
    try {
      const data = await communicationsApi.getRemindersPreview({
        courseId: selectedCourseId ? Number(selectedCourseId) : undefined,
      });
      setPreview(data);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al previsualizar recordatorios de pago",
      );
    } finally {
      setLoadingPreview(false);
    }
  }, [open, selectedCourseId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const handleSend = async () => {
    setSending(true);
    try {
      const result = await communicationsApi.sendPaymentReminders({
        courseId: selectedCourseId ? Number(selectedCourseId) : undefined,
      });

      toast.success(
        `Recordatorios enviados: ${result.sent} entregados exitosamente${
          result.failed > 0 ? `, ${result.failed} con error` : ""
        }`,
      );

      onOpenChange(false);
      onSent?.();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al enviar los recordatorios",
      );
    } finally {
      setSending(false);
    }
  };

  const toggleExpand = (studentId: number) => {
    setExpandedStudentId((prev) => (prev === studentId ? null : studentId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <BellRing className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-xl font-bold text-white">
                Envío Inteligente de Recordatorios
              </DialogTitle>
              <DialogDescription className="text-xs text-[var(--color-text-secondary)]">
                Notifica a los apoderados con cuotas vencidas mediante un correo consolidado
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Course filter selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Filtrar por Curso
            </label>
            <NativeSelectField
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="h-9 w-60 rounded-lg border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-white"
            >
              <option value="">Todos los cursos con morosidad</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelectField>
          </div>

          {/* Metrics summary cards */}
          {loadingPreview ? (
            <div className="flex items-center justify-center py-12">
              <LoaderCircle className="size-8 animate-spin text-[var(--color-primary)]" />
            </div>
          ) : preview ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Destinatarios
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">
                    {preview.totalRecipients}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    Apoderados con email
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Alumnos
                  </p>
                  <p className="mt-1 text-2xl font-bold text-amber-400">
                    {preview.totalStudents}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    {preview.totalCharges} cuotas vencidas
                  </p>
                </div>
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-red-300">
                    Monto a Cobrar
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold text-red-400">
                    {formatCLP(preview.totalOverdueAmount)}
                  </p>
                  <p className="text-[10px] text-red-300/70">Deuda vencida total</p>
                </div>
              </div>

              {preview.students.length === 0 ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center text-emerald-300">
                  <CheckCircle2 className="mx-auto size-8 text-emerald-400" />
                  <p className="mt-2 text-sm font-semibold">¡Excelente noticia!</p>
                  <p className="mt-1 text-xs text-emerald-300/80">
                    No se registran apoderados con cuotas vencidas en esta selección.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Detalle de Destinatarios ({preview.students.length})
                    </p>
                    <span className="text-[11px] text-[var(--color-text-muted)]">
                      Se enviará 1 correo consolidado por alumno
                    </span>
                  </div>

                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {preview.students.map((student) => {
                      const isExpanded = expandedStudentId === student.studentId;

                      return (
                        <div
                          key={student.studentId}
                          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/80 transition-colors"
                        >
                          <div
                            onClick={() => toggleExpand(student.studentId)}
                            className="flex cursor-pointer items-center justify-between p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-semibold text-white">
                                  {student.studentName}
                                </p>
                                <Badge className="border-blue-500/30 bg-blue-500/15 text-[10px] text-blue-300">
                                  {student.courseName}
                                </Badge>
                              </div>
                              <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
                                Apod: {student.guardianName} &bull; {student.guardianEmail}
                              </p>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="font-mono text-sm font-bold text-red-400">
                                  {formatCLP(student.totalOverdueAmount)}
                                </p>
                                <p className="text-[10px] text-[var(--color-text-muted)]">
                                  {student.chargesCount} cuota(s)
                                </p>
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="size-4 text-[var(--color-text-muted)]" />
                              ) : (
                                <ChevronDown className="size-4 text-[var(--color-text-muted)]" />
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-[var(--color-border)]/60 bg-[var(--color-surface)]/50 p-3">
                              <p className="text-[11px] font-semibold text-[var(--color-text-muted)]">
                                Desglose de cuotas pendientes:
                              </p>
                              <div className="mt-2 space-y-1.5">
                                {student.charges.map((charge) => (
                                  <div
                                    key={charge.id}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span className="text-[var(--color-text-secondary)]">
                                      {charge.conceptName} (Vence:{" "}
                                      {new Date(charge.dueDate).toLocaleDateString(
                                        "es-CL",
                                      )}
                                      )
                                    </span>
                                    <span className="font-mono font-medium text-white">
                                      {formatCLP(charge.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter className="mt-4 gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={
              sending ||
              loadingPreview ||
              !preview ||
              preview.students.length === 0
            }
            onClick={handleSend}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            <Send className="size-4" />
            {sending
              ? "Enviando recordatorios..."
              : `Enviar ${preview?.students.length ?? 0} Recordatorios`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
