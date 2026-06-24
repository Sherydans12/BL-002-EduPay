"use client";

import { useEffect, useState } from "react";
import { conceptsApi } from "@/lib/api";
import type { PaymentConcept } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const conceptSchema = z.object({
  name: z
    .string()
    .min(2, "Mínimo 2 caracteres")
    .max(150, "Máximo 150 caracteres"),
  defaultAmount: z
    .number({ error: "El monto es requerido" })
    .int("Debe ser un número entero")
    .positive("Debe ser mayor a 0"),
  isActive: z.boolean(),
});

type ConceptFormData = z.infer<typeof conceptSchema>;

const inputCls =
  "w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none transition-all";

function fmt(amount: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ConceptosPage() {
  const [concepts, setConcepts] = useState<PaymentConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingConcept, setEditingConcept] = useState<PaymentConcept | null>(null);
  const [deletingConcept, setDeletingConcept] = useState<PaymentConcept | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConceptFormData>({
    resolver: zodResolver(conceptSchema),
    defaultValues: { isActive: true },
  });

  const loadData = async () => {
    try {
      const data = await conceptsApi.getAll();
      setConcepts(data);
    } catch {
      toast.error("Error al cargar conceptos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateDialog = () => {
    setEditingConcept(null);
    reset({ name: "", defaultAmount: undefined as unknown as number, isActive: true });
    setIsDialogOpen(true);
  };

  const openEditDialog = (concept: PaymentConcept) => {
    setEditingConcept(concept);
    reset({
      name: concept.name,
      defaultAmount: concept.defaultAmount,
      isActive: concept.isActive,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: ConceptFormData) => {
    setIsSubmitting(true);
    try {
      if (editingConcept) {
        await conceptsApi.update(editingConcept.id, data);
        toast.success("Concepto actualizado correctamente");
      } else {
        await conceptsApi.create(data);
        toast.success("Concepto creado correctamente");
      }
      setIsDialogOpen(false);
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar concepto");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingConcept) return;
    try {
      await conceptsApi.delete(deletingConcept.id);
      toast.success(`Concepto "${deletingConcept.name}" desactivado`);
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar concepto");
    } finally {
      setDeletingConcept(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Conceptos de Pago</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">
            Administra los aranceles y conceptos disponibles para registrar pagos
          </p>
        </div>
        <button
          onClick={openCreateDialog}
          className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] text-sm"
        >
          + Nuevo Concepto
        </button>
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : concepts.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">
            No hay conceptos registrados
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-[var(--color-bg)]/50 text-xs uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-6 py-4 font-medium">Nombre</th>
                <th className="px-6 py-4 font-medium">Rendimiento Histórico</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {concepts.map((concept) => (
                <tr
                  key={concept.id}
                  className="hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  <td className="px-6 py-4 font-medium text-white">{concept.name}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1.5 tabular-nums">
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {fmt(concept.defaultAmount)} base
                      </span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-semibold text-emerald-600">
                          {fmt(concept.totalCollected)}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          de {fmt(concept.totalBilled)}
                        </span>
                      </div>
                      {concept.totalBilled > 0 && (
                        <div
                          role="progressbar"
                          aria-label={`Porcentaje recaudado de ${concept.name}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.min(
                            100,
                            Math.round(
                              (concept.totalCollected / concept.totalBilled) * 100,
                            ),
                          )}
                          className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-[var(--color-border)]"
                        >
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                (concept.totalCollected / concept.totalBilled) * 100,
                              )}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        concept.isActive
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {concept.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => openEditDialog(concept)}
                      className="text-sm px-3 py-1.5 rounded-lg border border-blue-500/50 text-blue-400 hover:bg-blue-500/10 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => setDeletingConcept(concept)}
                      className="text-sm px-3 py-1.5 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingConcept ? "Editar Concepto" : "Nuevo Concepto de Pago"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Nombre *
              </label>
              <input
                {...register("name")}
                placeholder="Ej: Mensualidad General"
                className={inputCls}
              />
              {errors.name && (
                <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Monto por Defecto ($) *
              </label>
              <input
                type="number"
                min="1"
                placeholder="75000"
                {...register("defaultAmount", { valueAsNumber: true })}
                className={inputCls}
              />
              {errors.defaultAmount && (
                <p className="text-red-400 text-xs mt-1">{errors.defaultAmount.message}</p>
              )}
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Se autocompletará al seleccionar este concepto en un pago (editable).
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isActive"
                {...register("isActive")}
                className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] bg-[var(--color-bg)] focus:ring-[var(--color-primary)]"
              />
              <label
                htmlFor="isActive"
                className="text-sm font-medium text-[var(--color-text-secondary)] cursor-pointer"
              >
                Concepto activo
              </label>
            </div>
            <DialogFooter className="mt-6 pt-4">
              <button
                type="button"
                onClick={() => setIsDialogOpen(false)}
                className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold shadow-lg transition-all disabled:opacity-50"
              >
                {isSubmitting
                  ? "Guardando..."
                  : editingConcept
                  ? "Guardar Cambios"
                  : "Crear Concepto"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Soft-delete Confirm Dialog */}
      <AlertDialog
        open={!!deletingConcept}
        onOpenChange={(open) => !open && setDeletingConcept(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Concepto</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--color-text-secondary)]">
              ¿Estás seguro de que deseas desactivar el concepto{" "}
              <strong>&ldquo;{deletingConcept?.name}&rdquo;</strong>? Ya no aparecerá
              disponible al registrar nuevos pagos. Los pagos existentes no se verán
              afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-white">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
