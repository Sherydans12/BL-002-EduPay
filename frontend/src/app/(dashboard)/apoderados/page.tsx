"use client";

import { useEffect, useState } from "react";
import { guardiansApi } from "@/lib/api";
import type { Guardian } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const rutRegex = /^(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])$/;
function isValidRut(rut: string): boolean {
  const clean = rut.replace(/\./g, "").replace("-", "");
  if (clean.length < 8 || clean.length > 9) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1).toUpperCase();
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const expected = 11 - (sum % 11);
  const expectedDv = expected === 11 ? "0" : expected === 10 ? "K" : expected.toString();
  return dv === expectedDv;
}

const guardianSchema = z.object({
  rut: z.string().refine((val) => rutRegex.test(val) && isValidRut(val), "RUT inválido (formato: 12.345.678-9)"),
  name: z.string().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
});

type GuardianFormData = z.infer<typeof guardianSchema>;

export default function GuardiansPage() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGuardian, setEditingGuardian] = useState<Guardian | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<GuardianFormData>({
    resolver: zodResolver(guardianSchema),
    defaultValues: { rut: "", name: "", email: "", phone: "" }
  });

  const load = async () => {
    try {
      setGuardians(await guardiansApi.getAll());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cargar apoderados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreateDialog = () => {
    setEditingGuardian(null);
    reset({ rut: "", name: "", email: "", phone: "" });
    setIsDialogOpen(true);
  };

  const openEditDialog = (g: Guardian) => {
    setEditingGuardian(g);
    reset({ rut: g.rut, name: g.name, email: g.email || "", phone: g.phone || "" });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: GuardianFormData) => {
    setIsSubmitting(true);
    const payload = { ...data, email: data.email || undefined, phone: data.phone || undefined };
    try {
      if (editingGuardian) {
        await guardiansApi.update(editingGuardian.id, payload);
        toast.success("Apoderado actualizado exitosamente");
      } else {
        await guardiansApi.create(payload);
        toast.success("Apoderado creado exitosamente");
      }
      setIsDialogOpen(false);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await guardiansApi.delete(deleteId);
      toast.success("Apoderado eliminado exitosamente");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar. Puede tener alumnos asociados.");
    } finally {
      setDeleteId(null);
    }
  };

  const filtered = guardians.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    g.rut.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Apoderados</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">Gestión de apoderados / tutores</p>
        </div>
        <button
          onClick={openCreateDialog}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] text-sm"
        >
          + Nuevo Apoderado
        </button>
      </div>

      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Buscar apoderado por nombre o RUT..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-1/2 px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none transition-all text-sm"
        />
        <span className="text-sm text-[var(--color-text-muted)]">{filtered.length} resultados</span>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">No hay apoderados que coincidan con la búsqueda</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                <th className="px-6 py-4">RUT</th><th className="px-6 py-4">Nombre</th><th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Teléfono</th><th className="px-6 py-4">Alumnos</th><th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filtered.map((g) => (
                <tr key={g.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-[var(--color-text-secondary)]">{g.rut}</td>
                  <td className="px-6 py-4 font-medium text-white">{g.name}</td>
                  <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">{g.email || "—"}</td>
                  <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">{g.phone || "—"}</td>
                  <td className="px-6 py-4"><span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400">{g._count?.students ?? 0}</span></td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => openEditDialog(g)} className="text-sm text-[var(--color-primary)] hover:underline">Editar</button>
                    <button onClick={() => setDeleteId(g.id)} className="text-sm text-red-400 hover:underline">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-[var(--color-bg)] border-[var(--color-border)] text-white sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{editingGuardian ? "Editar Apoderado" : "Nuevo Apoderado"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-full md:col-span-1">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">RUT *</label>
                <input {...register("rut")} placeholder="12.345.678-9" className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none" />
                {errors.rut && <p className="text-red-400 text-xs mt-1">{errors.rut.message}</p>}
              </div>
              <div className="col-span-full md:col-span-1">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Nombre *</label>
                <input {...register("name")} placeholder="Nombre completo" className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none" />
                {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div className="col-span-full md:col-span-1">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Email</label>
                <input {...register("email")} type="email" placeholder="correo@ejemplo.cl" className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none" />
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
              </div>
              <div className="col-span-full md:col-span-1">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Teléfono</label>
                <input {...register("phone")} placeholder="+56 9 1234 5678" className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none" />
                {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone.message}</p>}
              </div>
            </div>
            <DialogFooter className="mt-6">
              <button type="button" onClick={() => setIsDialogOpen(false)} className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50">
                {isSubmitting ? "Guardando..." : "Guardar"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="bg-[var(--color-bg)] border-[var(--color-border)] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--color-text-secondary)]">Esta acción no se puede deshacer. Se eliminará permanentemente este apoderado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-white">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white border-0">Sí, eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
