"use client";

import { useEffect, useState } from "react";
import { rolesApi } from "@/lib/api";
import type { Role, Permission } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const roleSchema = z.object({
  name: z.string().min(1, "El nombre del rol es requerido").toUpperCase(),
});

type RoleFormData = z.infer<typeof roleSchema>;

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
  });

  const loadData = async () => {
    try {
      const [r, p] = await Promise.all([rolesApi.getAll(), rolesApi.getPermissions()]);
      setRoles(r);
      setPermissions(p);
    } catch (err: unknown) {
      toast.error("Error al cargar roles y permisos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openCreateDialog = () => {
    reset({ name: "" });
    setSelectedPermissions([]);
    setIsDialogOpen(true);
  };

  const handleCheckboxChange = (id: number) => {
    setSelectedPermissions(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const onSubmit = async (data: RoleFormData) => {
    if (selectedPermissions.length === 0) {
      toast.error("Debe seleccionar al menos un permiso");
      return;
    }
    setIsSubmitting(true);
    try {
      await rolesApi.create({ name: data.name, permissionIds: selectedPermissions });
      toast.success("Rol creado exitosamente");
      setIsDialogOpen(false);
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear rol");
    } finally {
      setIsSubmitting(false);
    }
  };

  const groupedPermissions = permissions.reduce((acc, perm) => {
    (acc[perm.module] = acc[perm.module] || []).push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <div className="max-w-6xl mx-auto p-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Gestión de Roles</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">Configura roles y permisos del sistema</p>
        </div>
        <button
          onClick={openCreateDialog}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] text-sm"
        >
          + Crear Rol
        </button>
      </div>

      <div className="glass rounded-xl border-[var(--color-border)] overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : roles.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">No hay roles configurados</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {roles.map(role => (
              <div key={role.id} className="bg-[var(--color-bg)]/50 p-5 rounded-xl border border-[var(--color-border)]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">{role.name}</h3>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/15 text-blue-300">
                    {role.permissions?.length || 0} permisos
                  </span>
                </div>
                <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                  {role.permissions?.map(p => (
                    <div key={p.id} className="text-xs text-[var(--color-text-secondary)] flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] opacity-70" />
                      {p.action}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Crear Nuevo Rol</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Nombre del Rol *</label>
              <input
                {...register("name")}
                placeholder="Ej: SECRETARIA"
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none uppercase"
              />
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-3">Permisos *</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(groupedPermissions).map(([module, perms]) => (
                  <div key={module} className="bg-[var(--color-surface)] p-4 rounded-xl border border-[var(--color-border)]">
                    <h4 className="font-semibold text-[var(--color-primary)] mb-3 uppercase text-xs tracking-wider border-b border-[var(--color-border)] pb-2">
                      {module}
                    </h4>
                    <div className="space-y-2.5">
                      {perms.map(perm => (
                        <label key={perm.id} className="flex items-center space-x-3 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={selectedPermissions.includes(perm.id)}
                            onChange={() => handleCheckboxChange(perm.id)}
                            className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] bg-[var(--color-bg)]"
                          />
                          <span className="text-sm text-[var(--color-text-secondary)] group-hover:text-white transition-colors select-none">
                            {perm.action}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-4">
              <button type="button" onClick={() => setIsDialogOpen(false)} className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg transition-all disabled:opacity-50">
                {isSubmitting ? "Guardando..." : "Guardar Rol"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
