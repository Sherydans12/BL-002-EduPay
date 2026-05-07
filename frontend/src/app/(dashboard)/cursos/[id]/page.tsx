"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { coursesApi, guardiansApi } from "@/lib/api";
import type { Course, CourseWithStudents, Guardian, Student } from "@/lib/api";
import { StudentFormDialog } from "@/components/student-form-dialog";

function rowToStudent(row: CourseWithStudents["students"][number], courseName: string): Student {
  return {
    id: row.id,
    rut: row.rut,
    name: row.name,
    courseId: row.courseId,
    guardianId: row.guardianId,
    course: { id: row.courseId, name: courseName },
    guardian: row.guardian,
  };
}

export default function CourseStudentsPage() {
  const params = useParams();
  const rawId = params.id;
  const courseId = typeof rawId === "string" ? Number(rawId) : Number(Array.isArray(rawId) ? rawId[0] : NaN);

  const [course, setCourse] = useState<CourseWithStudents | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const reloadCourse = useCallback(async () => {
    if (!Number.isFinite(courseId) || courseId < 1) return;
    try {
      const data = await coursesApi.getOne(courseId);
      setCourse(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cargar el curso");
      setCourse(null);
    }
  }, [courseId]);

  useEffect(() => {
    if (!Number.isFinite(courseId) || courseId < 1) {
      setLoading(false);
      setCourse(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await coursesApi.getOne(courseId);
        if (!cancelled) setCourse(data);
      } catch (err: unknown) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Error al cargar el curso");
          setCourse(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [courseId]);

  useEffect(() => {
    Promise.all([coursesApi.getAll(1, 200), guardiansApi.getAll(1, 200)])
      .then(([cRes, gRes]) => {
        setCourses(cRes.data);
        setGuardians(gRes.data);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!course?.students) return [];
    const q = searchTerm.toLowerCase().trim();
    if (!q) return course.students;
    return course.students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.rut.toLowerCase().includes(q) ||
        s.guardian.name.toLowerCase().includes(q)
    );
  }, [course, searchTerm]);

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) setEditingStudent(null);
  };

  const openEditDialog = (row: CourseWithStudents["students"][number]) => {
    if (!course) return;
    setEditingStudent(rowToStudent(row, course.name));
    setIsDialogOpen(true);
  };

  if (!Number.isFinite(courseId) || courseId < 1) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <p className="text-[var(--color-text-muted)]">Identificador de curso inválido.</p>
        <Link href="/cursos" className="text-sm text-[var(--color-primary)] hover:underline">
          ← Volver a cursos
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div>
        <Link
          href="/cursos"
          className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a cursos
        </Link>
        <h1 className="text-3xl font-bold text-white">
          {loading ? "Cargando…" : course?.name ?? "Curso"}
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          Alumnos inscritos en este curso
          {!loading && course != null && (
            <span className="text-[var(--color-text-muted)]">
              {" "}
              · {course.students.length} alumno{course.students.length === 1 ? "" : "s"}
            </span>
          )}
        </p>
      </div>

      {!loading && course && (
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Buscar por nombre, RUT o apoderado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-2/3 px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] outline-none transition-all text-sm"
          />
        </div>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !course ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">No se pudo cargar el curso.</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">
            {course.students.length === 0
              ? "Este curso aún no tiene alumnos asignados."
              : "Ningún alumno coincide con la búsqueda."}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                <th className="px-6 py-4">RUT</th>
                <th className="px-6 py-4">Nombre</th>
                <th className="px-6 py-4">Apoderado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-[var(--color-text-secondary)]">{s.rut}</td>
                  <td className="px-6 py-4 font-medium text-white">{s.name}</td>
                  <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">{s.guardian.name}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => openEditDialog(s)}
                      className="text-sm text-[var(--color-primary)] hover:underline"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <StudentFormDialog
        open={isDialogOpen}
        onOpenChange={handleDialogOpenChange}
        courses={courses}
        guardians={guardians}
        editingStudent={editingStudent}
        defaultCourseId={courseId}
        onSaved={reloadCourse}
      />
    </div>
  );
}
