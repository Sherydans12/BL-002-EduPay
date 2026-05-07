"use client";

import { useEffect, useState } from "react";
import { studentsApi, coursesApi, guardiansApi } from "@/lib/api";
import type { Student, Course, Guardian } from "@/lib/api";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { TablePagination } from "@/components/ui/table-pagination";

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

const studentSchema = z.object({
  rut: z.string().refine((val) => rutRegex.test(val) && isValidRut(val), "RUT inválido (formato: 12.345.678-9)"),
  name: z.string().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  courseId: z.number().min(1, "Seleccione un curso"),
  guardianId: z.number().min(1, "Seleccione un apoderado"),
});

type StudentFormData = z.infer<typeof studentSchema>;

const LIMIT = 20;

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: LIMIT, lastPage: 1 });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Combobox states
  const [courseOpen, setCourseOpen] = useState(false);
  const [guardianOpen, setGuardianOpen] = useState(false);

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<StudentFormData>({
    resolver: zodResolver(studentSchema),
  });

  // Load dropdown data once (for the create/edit form)
  useEffect(() => {
    Promise.all([coursesApi.getAll(1, 200), guardiansApi.getAll(1, 200)])
      .then(([cRes, gRes]) => { setCourses(cRes.data); setGuardians(gRes.data); })
      .catch(() => {});
  }, []);

  const loadStudents = async (p: number) => {
    setLoading(true);
    try {
      const res = await studentsApi.getAll(undefined, p, LIMIT);
      setStudents(res.data);
      setMeta(res.meta);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cargar alumnos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStudents(page); }, [page]);

  const openCreateDialog = () => {
    setEditingStudent(null);
    reset({ rut: "", name: "", courseId: undefined, guardianId: undefined });
    setIsDialogOpen(true);
  };

  const openEditDialog = (s: Student) => {
    setEditingStudent(s);
    reset({ rut: s.rut, name: s.name, courseId: s.courseId, guardianId: s.guardianId });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: StudentFormData) => {
    setIsSubmitting(true);
    try {
      if (editingStudent) {
        await studentsApi.update(editingStudent.id, data);
        toast.success("Alumno actualizado exitosamente");
        loadStudents(page);
      } else {
        await studentsApi.create(data);
        toast.success("Alumno creado exitosamente");
        setPage(1);
        if (page === 1) loadStudents(1);
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
      await studentsApi.delete(deleteId);
      toast.success("Alumno eliminado exitosamente");
      loadStudents(page);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar alumno");
    } finally {
      setDeleteId(null);
    }
  };

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.rut.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Alumnos</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">Gestión de alumnos del colegio</p>
        </div>
        <button
          onClick={openCreateDialog}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] text-sm"
        >
          + Nuevo Alumno
        </button>
      </div>

      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Buscar alumno por nombre o RUT..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-1/2 px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none transition-all text-sm"
        />
        <span className="text-sm text-[var(--color-text-muted)]">{meta.total} alumnos en total</span>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">No hay alumnos que coincidan con la búsqueda</div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                  <th className="px-6 py-4">RUT</th><th className="px-6 py-4">Nombre</th><th className="px-6 py-4">Curso</th>
                  <th className="px-6 py-4">Apoderado</th><th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                    <td className="px-6 py-4 text-sm font-mono text-[var(--color-text-secondary)]">{s.rut}</td>
                    <td className="px-6 py-4 font-medium text-white">{s.name}</td>
                    <td className="px-6 py-4"><span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-300">{s.course.name}</span></td>
                    <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">{s.guardian.name}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => openEditDialog(s)} className="text-sm text-[var(--color-primary)] hover:underline">Editar</button>
                      <button onClick={() => setDeleteId(s.id)} className="text-sm text-red-400 hover:underline">Eliminar</button>
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
        <DialogContent className="bg-[var(--color-bg)] border-[var(--color-border)] text-white sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{editingStudent ? "Editar Alumno" : "Nuevo Alumno"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 overflow-visible">
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

              <div className="col-span-full">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Curso *</label>
                <Controller
                  name="courseId"
                  control={control}
                  render={({ field }) => (
                    <Popover open={courseOpen} onOpenChange={setCourseOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-left text-white focus:border-[var(--color-primary)] outline-none flex justify-between items-center"
                        >
                          {field.value ? courses.find(c => c.id === field.value)?.name : "Seleccionar curso..."}
                          <span className="text-[var(--color-text-muted)] text-xs">▼</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[450px] p-0 bg-[var(--color-surface)] border-[var(--color-border)] text-white z-[60]">
                        <Command className="bg-transparent">
                          <CommandInput placeholder="Buscar curso..." className="border-none focus:ring-0" />
                          <CommandList>
                            <CommandEmpty>No se encontró el curso.</CommandEmpty>
                            <CommandGroup>
                              {courses.map(course => (
                                <CommandItem
                                  key={course.id}
                                  onSelect={() => {
                                    field.onChange(course.id);
                                    setCourseOpen(false);
                                  }}
                                  className="cursor-pointer hover:bg-[var(--color-surface-hover)] data-[selected=true]:bg-[var(--color-surface-hover)]"
                                >
                                  {course.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                />
                {errors.courseId && <p className="text-red-400 text-xs mt-1">{errors.courseId.message}</p>}
              </div>

              <div className="col-span-full">
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Apoderado *</label>
                <Controller
                  name="guardianId"
                  control={control}
                  render={({ field }) => (
                    <Popover open={guardianOpen} onOpenChange={setGuardianOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-left text-white focus:border-[var(--color-primary)] outline-none flex justify-between items-center"
                        >
                          {field.value ? guardians.find(g => g.id === field.value)?.name : "Seleccionar apoderado..."}
                          <span className="text-[var(--color-text-muted)] text-xs">▼</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[450px] p-0 bg-[var(--color-surface)] border-[var(--color-border)] text-white z-[60]">
                        <Command className="bg-transparent">
                          <CommandInput placeholder="Buscar apoderado por nombre o RUT..." className="border-none focus:ring-0" />
                          <CommandList>
                            <CommandEmpty>No se encontró el apoderado.</CommandEmpty>
                            <CommandGroup>
                              {guardians.map(g => (
                                <CommandItem
                                  key={g.id}
                                  onSelect={() => {
                                    field.onChange(g.id);
                                    setGuardianOpen(false);
                                  }}
                                  className="cursor-pointer hover:bg-[var(--color-surface-hover)] data-[selected=true]:bg-[var(--color-surface-hover)]"
                                >
                                  <div className="flex flex-col">
                                    <span>{g.name}</span>
                                    <span className="text-xs text-[var(--color-text-muted)]">{g.rut}</span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                />
                {errors.guardianId && <p className="text-red-400 text-xs mt-1">{errors.guardianId.message}</p>}
              </div>
            </div>

            <DialogFooter className="mt-6 pt-4 border-t border-[var(--color-border)]">
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
            <AlertDialogDescription className="text-[var(--color-text-secondary)]">Esta acción no se puede deshacer. Se eliminará permanentemente este alumno y sus pagos asociados.</AlertDialogDescription>
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
