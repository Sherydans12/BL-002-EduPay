"use client";

import { useEffect, useState, useRef } from "react";
import { studentsApi, downloadBlob } from "@/lib/api";
import { fetchAllCourses, fetchAllGuardians } from "@/lib/fetch-all-pages";
import type { Student, Course, Guardian } from "@/lib/api";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { StudentFormDialog } from "@/components/student-form-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TablePagination } from "@/components/ui/table-pagination";

const LIMIT = 20;

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const prevDebouncedSearch = useRef<string | null>(null);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: LIMIT, lastPage: 1 });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    Promise.all([fetchAllCourses(), fetchAllGuardians()])
      .then(([cRes, gRes]) => {
        setCourses(cRes);
        setGuardians(gRes);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    const searchChanged =
      prevDebouncedSearch.current !== null &&
      prevDebouncedSearch.current !== debouncedSearch;

    if (searchChanged && page !== 1) {
      setPage(1);
      return;
    }

    prevDebouncedSearch.current = debouncedSearch;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await studentsApi.getAll(undefined, page, LIMIT, debouncedSearch || undefined);
        if (cancelled) return;
        setStudents(res.data);
        setMeta({
          total: res.meta.total,
          page: res.meta.page,
          limit: res.meta.limit,
          lastPage: res.meta.lastPage ?? res.meta.totalPages ?? 1,
        });
      } catch (err: unknown) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Error al cargar alumnos");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch]);

  const reloadCurrentStudents = async () => {
    setLoading(true);
    try {
      const res = await studentsApi.getAll(undefined, page, LIMIT, debouncedSearch || undefined);
      setStudents(res.data);
      setMeta({
        total: res.meta.total,
        page: res.meta.page,
        limit: res.meta.limit,
        lastPage: res.meta.lastPage ?? res.meta.totalPages ?? 1,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cargar alumnos");
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingStudent(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (s: Student) => {
    setEditingStudent(s);
    setIsDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) setEditingStudent(null);
  };

  const handleStudentSaved = async () => {
    if (editingStudent) {
      await reloadCurrentStudents();
    } else {
      setPage(1);
      if (page === 1) await reloadCurrentStudents();
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await studentsApi.delete(deleteId);
      toast.success("Alumno eliminado exitosamente");
      await reloadCurrentStudents();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar alumno");
    } finally {
      setDeleteId(null);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    const toastId = toast.loading("Generando Excel...");
    try {
      const blob = await studentsApi.export();
      downloadBlob(blob, `alumnos_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success("Descarga completada", { id: toastId });
    } catch {
      toast.error("Error al exportar", { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Alumnos</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">Gestión de alumnos del colegio</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-sm font-medium transition-all disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {isExporting ? "Exportando..." : "Exportar Excel"}
          </button>
          <button
            onClick={openCreateDialog}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] text-sm"
          >
            + Nuevo Alumno
          </button>
        </div>
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
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">No hay alumnos que coincidan con la búsqueda</div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                  <th className="px-6 py-4 whitespace-nowrap">RUT</th>
                  <th className="px-6 py-4">Nombre</th>
                  <th className="px-6 py-4">Curso</th>
                  <th className="px-6 py-4">Apoderado</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {students.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                    <td className="px-6 py-4 text-sm font-mono tabular-nums text-[var(--color-text-secondary)] whitespace-nowrap">{s.rut}</td>
                    <td className="px-6 py-4 font-medium text-white">{s.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-300 whitespace-nowrap">
                        {s.course.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">{s.guardian.name}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => openEditDialog(s)} className="text-sm text-[var(--color-primary)] hover:underline">
                        Editar
                      </button>
                      <button onClick={() => setDeleteId(s.id)} className="text-sm text-red-400 hover:underline">
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
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

      <StudentFormDialog
        open={isDialogOpen}
        onOpenChange={handleDialogOpenChange}
        courses={courses}
        guardians={guardians}
        editingStudent={editingStudent}
        onSaved={handleStudentSaved}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Está absolutamente seguro?</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--color-text-secondary)]">
              Esta acción no se puede deshacer. Se eliminará permanentemente este alumno y sus pagos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-white">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white border-0">
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
