"use client";

import { useEffect, useState } from "react";
import { usersApi, rolesApi } from "@/lib/api";
import type { User, Role } from "@/lib/api";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownChevron } from "@/components/ui/dropdown-chevron";

const userSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100),
  email: z.string().email("Email inválido"),
  roleId: z.number().min(1, "Seleccione un rol"),
});

type UserFormData = z.infer<typeof userSchema>;

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // AlertDialog state for toggling active
  const [toggleUser, setToggleUser] = useState<User | null>(null);

  const [roleOpen, setRoleOpen] = useState(false);

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
  });

  const loadData = async () => {
    try {
      const [u, r] = await Promise.all([usersApi.getAll(), rolesApi.getAll()]);
      setUsers(u);
      setRoles(r);
    } catch (err: unknown) {
      toast.error("Error al cargar usuarios o roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openCreateDialog = () => {
    reset({ name: "", email: "", roleId: undefined });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: UserFormData) => {
    setIsSubmitting(true);
    try {
      await usersApi.create(data);
      toast.success("Usuario invitado exitosamente");
      setIsDialogOpen(false);
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al invitar usuario");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmToggleStatus = async () => {
    if (!toggleUser) return;
    try {
      await usersApi.toggleActive(toggleUser.id);
      toast.success(`Usuario ${toggleUser.isActive ? "desactivado" : "activado"} correctamente`);
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cambiar estado");
    } finally {
      setToggleUser(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Gestión de Usuarios</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">Administra el acceso a la plataforma</p>
        </div>
        <button 
          onClick={openCreateDialog}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] text-sm"
        >
          + Invitar Usuario
        </button>
      </div>

      <div className="glass rounded-xl border-[var(--color-border)] overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">No hay usuarios registrados</div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-[var(--color-bg)]/50 text-xs uppercase tracking-wider text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-6 py-4 font-medium">Nombre</th>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-6 py-4 font-medium">Rol</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                  <td className="px-6 py-4 font-medium text-white">{user.name}</td>
                  <td className="px-6 py-4 text-[var(--color-text-secondary)]">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className="bg-blue-500/15 text-blue-300 px-2.5 py-1 rounded-lg text-xs font-semibold">
                      {user.role?.name || "Sin Rol"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${user.isActive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                      {user.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setToggleUser(user)}
                      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${user.isActive ? 'border-red-500/50 text-red-400 hover:bg-red-500/10' : 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10'}`}
                    >
                      {user.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Invitar Nuevo Usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 overflow-visible">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Nombre *</label>
              <input {...register("name")} placeholder="Juan Pérez" className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none" />
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Email *</label>
              <input {...register("email")} type="email" placeholder="juan@edupay.cl" className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none" />
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Rol *</label>
              <Controller
                name="roleId"
                control={control}
                render={({ field }) => (
                  <Popover open={roleOpen} onOpenChange={setRoleOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-left text-white focus:border-[var(--color-primary)] outline-none flex items-center gap-2"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {field.value ? roles.find(r => r.id === field.value)?.name : "Seleccionar rol..."}
                        </span>
                        <DropdownChevron />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0 z-[60]">
                      <Command className="bg-transparent">
                        <CommandInput placeholder="Buscar rol..." />
                        <CommandList>
                          <CommandEmpty>No se encontró el rol.</CommandEmpty>
                          <CommandGroup>
                            {roles.map(role => (
                              <CommandItem
                                key={role.id}
                                onSelect={() => {
                                  field.onChange(role.id);
                                  setRoleOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                {role.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.roleId && <p className="text-red-400 text-xs mt-1">{errors.roleId.message}</p>}
            </div>
            <DialogFooter className="mt-6 pt-4">
              <button type="button" onClick={() => setIsDialogOpen(false)} className="px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors">Cancelar</button>
              <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg transition-all disabled:opacity-50">
                {isSubmitting ? "Enviando..." : "Invitar"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toggleUser} onOpenChange={(open) => !open && setToggleUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Acción</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--color-text-secondary)]">
              ¿Estás seguro de que deseas {toggleUser?.isActive ? "desactivar" : "activar"} al usuario <strong>{toggleUser?.name}</strong>?
              {toggleUser?.isActive && " Esto revocará su acceso al sistema de inmediato."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-white">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmToggleStatus} 
              className={toggleUser?.isActive ? "bg-red-600 hover:bg-red-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
            >
              Sí, {toggleUser?.isActive ? "Desactivar" : "Activar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
