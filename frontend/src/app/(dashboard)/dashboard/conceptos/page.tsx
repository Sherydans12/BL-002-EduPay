"use client";

import { useEffect, useState, useMemo } from "react";
import { conceptsApi } from "@/lib/api";
import type { PaymentConcept } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import {
  Tag,
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Loader2,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCLP } from "@/lib/currency-utils";

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

export default function ConceptosPage() {
  const [concepts, setConcepts] = useState<PaymentConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
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
    setLoading(true);
    try {
      const data = await conceptsApi.getAll();
      setConcepts(data);
    } catch {
      toast.error("Error al cargar los conceptos de pago");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openCreateDialog = () => {
    setEditingConcept(null);
    reset({
      name: "",
      defaultAmount: undefined as unknown as number,
      isActive: true,
    });
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
        toast.success("Concepto creado exitosamente");
      }
      setIsDialogOpen(false);
      await loadData();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al guardar el concepto",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingConcept) return;
    try {
      await conceptsApi.delete(deletingConcept.id);
      toast.success(`Concepto "${deletingConcept.name}" desactivado`);
      await loadData();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Error al desactivar el concepto",
      );
    } finally {
      setDeletingConcept(null);
    }
  };

  // Filtered concepts
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return concepts;
    return concepts.filter((c) => c.name.toLowerCase().includes(term));
  }, [concepts, searchTerm]);

  // Aggregates
  const stats = useMemo(() => {
    const totalConcepts = concepts.length;
    const activeCount = concepts.filter((c) => c.isActive).length;
    const totalBilled = concepts.reduce((s, c) => s + (c.totalBilled || 0), 0);
    const totalCollected = concepts.reduce((s, c) => s + (c.totalCollected || 0), 0);
    const overallRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 100;
    return { totalConcepts, activeCount, totalBilled, totalCollected, overallRate };
  }, [concepts]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400">
              <Tag className="size-5" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Conceptos de Pago
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Catálogo de aranceles, mensualidades, matrículas y cargos aplicables
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={openCreateDialog}
            className="gap-2 text-xs bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-lg shadow-blue-600/20"
          >
            <Plus className="size-3.5" />
            Nuevo Concepto
          </Button>
        </div>
      </div>

      {/* KPIs Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Total Conceptos
          </span>
          <p className="mt-2 text-2xl font-bold text-white">{stats.totalConcepts}</p>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            {stats.activeCount} activos para cobro
          </p>
        </div>

        <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Total Facturado por Conceptos
          </span>
          <p className="mt-2 font-mono text-2xl font-bold text-white">
            {formatCLP(stats.totalBilled)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Compromiso histórico
          </p>
        </div>

        <div className="glass rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
          <span className="text-xs font-medium text-emerald-300">
            Total Recaudado
          </span>
          <p className="mt-2 font-mono text-2xl font-bold text-emerald-400">
            {formatCLP(stats.totalCollected)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-bg)]">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${stats.overallRate}%` }}
              />
            </div>
            <span className="font-mono text-[11px] font-semibold text-emerald-300">
              {stats.overallRate}%
            </span>
          </div>
        </div>

        <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Configuración Rápida
          </span>
          <div className="mt-2 text-xs text-blue-300 font-semibold">
            Matrículas & Mensualidades
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Disponibles en módulo de cobro
          </p>
        </div>
      </div>

      {/* Barra de Búsqueda */}
      <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar concepto por nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] pl-9 pr-3 text-xs text-white placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] outline-none"
          />
        </div>

        <span className="text-xs text-[var(--color-text-muted)]">
          {filtered.length} concepto(s) disponible(s)
        </span>
      </div>

      {/* Tabla de Conceptos */}
      <div className="glass overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-[var(--color-text-muted)]">
            <Loader2 className="size-8 animate-spin text-[var(--color-primary)]" />
            <p className="mt-2 text-xs">Cargando catálogo de conceptos...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-[var(--color-text-muted)]">
            <Tag className="mx-auto size-10 text-[var(--color-text-muted)]/40" />
            <p className="mt-3 text-sm font-semibold text-white">
              No se encontraron conceptos de pago
            </p>
            <p className="mt-1 text-xs">
              Prueba creando un nuevo concepto como &quot;Matrícula&quot; o &quot;Mensualidad&quot;.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--color-bg)] shadow-sm">
                <tr className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  <th className="px-6 py-3.5">Nombre del Concepto</th>
                  <th className="px-6 py-3.5">Monto Base Sugerido</th>
                  <th className="px-6 py-3.5">Rendimiento Histórico</th>
                  <th className="px-6 py-3.5 text-center">Estado</th>
                  <th className="px-6 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.map((concept) => {
                  const rate =
                    concept.totalBilled > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (concept.totalCollected / concept.totalBilled) * 100,
                          ),
                        )
                      : 0;

                  return (
                    <tr
                      key={concept.id}
                      className="transition-colors hover:bg-[var(--color-surface-hover)] group"
                    >
                      {/* Nombre */}
                      <td className="px-6 py-4">
                        <span className="font-bold text-white text-sm">
                          {concept.name}
                        </span>
                      </td>

                      {/* Monto Base */}
                      <td className="px-6 py-4 font-mono text-sm font-semibold text-white">
                        {formatCLP(concept.defaultAmount)}
                      </td>

                      {/* Rendimiento */}
                      <td className="px-6 py-4">
                        <div className="space-y-1 max-w-[200px]">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-mono text-emerald-400 font-bold">
                              {formatCLP(concept.totalCollected)}
                            </span>
                            <span className="font-mono text-[var(--color-text-muted)]">
                              de {formatCLP(concept.totalBilled)}
                            </span>
                          </div>
                          {concept.totalBilled > 0 && (
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg)]">
                              <div
                                className="h-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="px-6 py-4 text-center">
                        <Badge
                          variant={concept.isActive ? "success" : "destructive"}
                          className="text-[10px]"
                        >
                          {concept.isActive ? "Activo" : "Inactivo"}
                        </Badge>
                      </td>

                      {/* Acciones */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditDialog(concept)}
                            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-white transition-colors"
                            title="Editar concepto"
                          >
                            <Pencil className="size-3.5 text-blue-400" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeletingConcept(concept)}
                            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-red-500/15 hover:text-red-300 transition-colors"
                            title="Desactivar concepto"
                          >
                            <Trash2 className="size-3.5 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Crear / Editar Concepto */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md bg-[var(--color-surface)] border-[var(--color-border)] text-white shadow-2xl">
          <DialogHeader className="border-b border-[var(--color-border)]/80 pb-3">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
              <Tag className="size-5 text-purple-400" />
              <span>
                {editingConcept ? "Editar Concepto de Pago" : "Nuevo Concepto de Pago"}
              </span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Nombre del Concepto *
              </label>
              <input
                {...register("name")}
                placeholder="Ej: Mensualidad Marzo 2026"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
              />
              {errors.name && (
                <p className="mt-1 text-[11px] text-red-400">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                Monto Base Sugerido ($ CLP) *
              </label>
              <input
                type="number"
                step="1"
                placeholder="45000"
                {...register("defaultAmount", { valueAsNumber: true })}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-xs font-mono text-white focus:border-[var(--color-primary)] outline-none"
              />
              {errors.defaultAmount && (
                <p className="mt-1 text-[11px] text-red-400">
                  {errors.defaultAmount.message}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isActive"
                {...register("isActive")}
                className="size-4 rounded border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-primary)] focus:ring-0"
              />
              <label
                htmlFor="isActive"
                className="text-xs font-medium text-white cursor-pointer"
              >
                Concepto activo para emisión de cobros y pagos
              </label>
            </div>

            <DialogFooter className="border-t border-[var(--color-border)]/80 pt-4 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="text-xs border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="gap-2 text-xs bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-md"
              >
                {isSubmitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                {editingConcept ? "Guardar Cambios" : "Crear Concepto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Alerta de Desactivación */}
      <AlertDialog
        open={deletingConcept !== null}
        onOpenChange={(open) => !open && setDeletingConcept(null)}
      >
        <AlertDialogContent className="bg-[var(--color-surface)] border-[var(--color-border)] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              ¿Desactivar concepto de pago?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--color-text-secondary)]">
              El concepto &quot;{deletingConcept?.name}&quot; ya no estará disponible para nuevos cobros. El historial de pagos anteriores no se verá afectado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[var(--color-border)] bg-[var(--color-surface)] text-white hover:bg-[var(--color-surface-hover)]">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
