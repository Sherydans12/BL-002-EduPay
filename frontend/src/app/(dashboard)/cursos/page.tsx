"use client";

import { useEffect, useState } from "react";
import { coursesApi } from "@/lib/api";
import type { Course } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TablePagination } from "@/components/ui/table-pagination";

const courseSchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(100, "Máximo 100 caracteres"),
});

type CourseFormData = z.infer<typeof courseSchema>;

const LIMIT = 20;

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: LIMIT, lastPage: 1 });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CourseFormData>({
    resolver: zodResolver(courseSchema),
  });

  const load = async (p: number) => {
    setLoading(true);
    try {
      const res = await coursesApi.getAll(p, LIMIT);
      setCourses(res.data);
      setMeta(res.meta);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cargar cursos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page); }, [page]);

  const openCreateDialog = () => {
    setEditingCourse(null);
    reset({ name: "" });
    setIsDialogOpen(true);
  };

  const openEditDialog = (c: Course) => {
    setEditingCourse(c);
    reset({ name: c.name });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: CourseFormData) => {
    setIsSubmitting(true);
    try {
      if (editingCourse) {
        await coursesApi.update(editingCourse.id, data);
        toast.success("Curso actualizado exitosamente");
        load(page);
      } else {
        await coursesApi.create(data);
        toast.success("Curso creado exitosamente");
        setPage(1);
        if (page === 1) load(1);
      }
      setIsDialogOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await coursesApi.delete(deleteId);
      toast.success("Curso eliminado exitosamente");
      load(page);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar. Puede tener alumnos asociados.");
    } finally {
      setDeleteId(null);
    }
  };

  const filtered = courses.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Cursos</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">Gestión de cursos del colegio</p>
        </div>
        <button
          onClick={openCreateDialog}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] text-sm"
        >
          + Nuevo Curso
        </button>
      </div>

      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Buscar curso por nombre..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-1/2 px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none transition-all text-sm"
        />
        <span className="text-sm text-[var(--color-text-muted)]">{meta.total} cursos en total</span>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">
            No hay cursos que coincidan con la búsqueda
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Nombre</th>
                  <th className="px-6 py-4">Alumnos</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                    <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">#{c.id}</td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-white">{c.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400">
                        {c._count?.students ?? 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => openEditDialog(c)}
                        className="text-sm text-[var(--color-primary)] hover:underline"
                      >
                        Editar
                      </button>
                      <button onClick={() => setDeleteId(c.id)} className="text-sm text-red-400 hover:underline">
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination
              page={meta.page}
              totalPages={meta.lastPage}
              total={meta.total}
              limit={meta.limit}
              onPrev={() => setPage((p) => p - 1)}
              onNext={() => setPage((p) => p + 1)}
            />
          </>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{editingCourse ? "Editar Curso" : "Nuevo Curso"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Nombre *</label>
              <input
                {...register("name")}
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none transition-all"
                placeholder="Ej: 1° Básico A"
              />
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <DialogFooter>
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
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50"
              >
                {isSubmitting ? "Guardando..." : "Guardar"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--color-text-secondary)]">
              Esta acción no se puede deshacer. Se eliminará permanentemente este curso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-white">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white border-0">
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
