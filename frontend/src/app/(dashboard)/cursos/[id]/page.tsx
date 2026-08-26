"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  GraduationCap,
  Users,
  Search,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  AlertTriangle,
  Mail,
  Phone,
  Pencil,
  Loader2,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { coursesApi, downloadBlob } from "@/lib/api";
import { fetchAllCourses, fetchAllGuardians } from "@/lib/fetch-all-pages";
import type { Course, CourseWithStudents, Guardian, Student } from "@/lib/api";
import { StudentFormDialog } from "@/components/student-form-dialog";
import { matchesStudentRow } from "@/lib/flexible-search";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCLP } from "@/lib/currency-utils";
import { formatRut } from "@/lib/rut";

function rowToStudent(
  row: CourseWithStudents["students"][number],
  courseName: string,
): Student {
  return {
    id: row.id,
    rut: row.rut,
    name: row.name,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    integrationReady: true,
    status: row.status ?? "ACTIVE",
    financialSetup: row.financialSetup ?? "PENDING",
    overdueDebt: 0,
    courseId: row.courseId,
    guardianId: row.guardianId,
    course: { id: row.courseId, name: courseName },
    guardian: row.guardian,
  };
}

export default function CourseStudentsPage() {
  const params = useParams();
  const rawId = params.id;
  const courseId =
    typeof rawId === "string"
      ? Number(rawId)
      : Number(Array.isArray(rawId) ? rawId[0] : NaN);

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
      toast.error(
        err instanceof Error ? err.message : "Error al cargar el curso",
      );
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
          toast.error(
            err instanceof Error ? err.message : "Error al cargar el curso",
          );
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
    Promise.all([fetchAllCourses(), fetchAllGuardians()])
      .then(([cRes, gRes]) => {
        setCourses(cRes);
        setGuardians(gRes);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!course?.students) return [];
    const q = searchTerm.trim();
    if (!q) return course.students;
    return course.students.filter((s) => matchesStudentRow(s, q));
  }, [course, searchTerm]);

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) setEditingStudent(null);
  };

  const openCreateDialog = () => {
    setEditingStudent(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (row: CourseWithStudents["students"][number]) => {
    if (!course) return;
    setEditingStudent(rowToStudent(row, course.name));
    setIsDialogOpen(true);
  };

  if (!Number.isFinite(courseId) || courseId < 1) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 animate-fade-in text-center py-20">
        <p className="text-[var(--color-text-muted)]">Identificador de curso inválido.</p>
        <Link href="/cursos" className="text-sm text-[var(--color-primary)] hover:underline">
          ← Volver a cursos
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-fade-in">
      {/* Cabecera y Navegación */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/cursos"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-white transition-colors mb-2"
          >
            <ArrowLeft className="size-3.5" />
            Volver a Cursos
          </Link>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
              <GraduationCap className="size-5" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                {loading ? "Cargando curso…" : course?.name ?? "Curso"}
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Nómina oficial de alumnos matriculados y supervisión financiera
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={openCreateDialog}
            className="gap-2 text-xs bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-lg shadow-blue-600/20"
          >
            <Plus className="size-3.5" />
            Inscribir Alumno
          </Button>
        </div>
      </div>

      {/* Tarjeta de Resumen del Curso */}
      {course && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              Total Alumnos
            </span>
            <p className="mt-2 text-2xl font-bold text-white">
              {course.students.length}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Inscritos en este nivel
            </p>
          </div>

          <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              Alumnos Activos
            </span>
            <p className="mt-2 text-2xl font-bold text-emerald-400">
              {course.students.filter((s) => s.status !== "INACTIVE" && s.status !== "GRADUATED").length}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Matrícula regular
            </p>
          </div>

          <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              Con Hermanos en el Colegio
            </span>
            <p className="mt-2 text-2xl font-bold text-blue-400">
              {course.students.filter((s) => (s.guardian?.students?.length ?? 0) > 1).length}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Grupos familiares
            </p>
          </div>

          <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              Acción Rápida
            </span>
            <div className="mt-2">
              <Link
                href="/reportes"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
              >
                Ver Sábana de Cuotas <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Matriz anual de pagos
            </p>
          </div>
        </div>
      )}

      {/* Buscador */}
      <div className="glass rounded-2xl border border-[var(--color-border)] p-4 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar por nombre, RUT o apoderado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] pl-9 pr-3 text-xs text-white placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] outline-none"
          />
        </div>

        <span className="text-xs text-[var(--color-text-muted)]">
          {filtered.length} alumno(s) encontrado(s)
        </span>
      </div>

      {/* Tabla de Alumnos */}
      <div className="glass overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-[var(--color-text-muted)]">
            <Loader2 className="size-8 animate-spin text-[var(--color-primary)]" />
            <p className="mt-2 text-xs">Cargando nómina de alumnos...</p>
          </div>
        ) : !course ? (
          <div className="py-20 text-center text-[var(--color-text-muted)]">
            No se pudo cargar el curso.
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-[var(--color-text-muted)]">
            <Users className="mx-auto size-10 text-[var(--color-text-muted)]/40" />
            <p className="mt-3 text-sm font-semibold text-white">
              {course.students.length === 0
                ? "Este curso aún no tiene alumnos asignados."
                : "Ningún alumno coincide con la búsqueda."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--color-bg)] shadow-sm">
                <tr className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  <th className="px-6 py-3.5">Alumno</th>
                  <th className="px-6 py-3.5">RUT</th>
                  <th className="px-6 py-3.5">Apoderado Titular</th>
                  <th className="px-6 py-3.5 text-center">Grupo Familiar</th>
                  <th className="px-6 py-3.5 text-center">Estado</th>
                  <th className="px-6 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filtered.map((s) => {
                  const siblingCount = (s.guardian?.students?.length ?? 0) - 1;

                  return (
                    <tr
                      key={s.id}
                      className="transition-colors hover:bg-[var(--color-surface-hover)] group"
                    >
                      {/* Alumno con link a Finanzas */}
                      <td className="px-6 py-4">
                        <Link
                          href={`/alumnos/${s.id}/finanzas`}
                          className="group/link inline-flex items-center gap-1 font-semibold text-white hover:text-[var(--color-primary)] transition-colors"
                        >
                          <span>{s.name}</span>
                          <ArrowUpRight className="size-3 opacity-0 group-hover/link:opacity-100 text-[var(--color-primary)] transition-opacity" />
                        </Link>
                      </td>

                      {/* RUT */}
                      <td className="px-6 py-4 font-mono text-[var(--color-text-secondary)]">
                        {s.rut ? formatRut(s.rut) : "—"}
                      </td>

                      {/* Apoderado */}
                      <td className="px-6 py-4">
                        <p className="font-medium text-white">{s.guardian.name}</p>
                        {s.guardian.phone && (
                          <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
                            {s.guardian.phone}
                          </p>
                        )}
                      </td>

                      {/* Badge de Hermanos */}
                      <td className="px-6 py-4 text-center">
                        {siblingCount > 0 ? (
                          <Badge className="border-blue-500/30 bg-blue-500/15 text-[10px] text-blue-300">
                            {siblingCount} hermano{siblingCount > 1 ? "s" : ""}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-[var(--color-text-muted)]/60">
                            Hijo único
                          </span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="px-6 py-4 text-center">
                        {s.status === "INACTIVE" ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Inactivo
                          </Badge>
                        ) : s.status === "GRADUATED" ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Egresado
                          </Badge>
                        ) : (
                          <Badge variant="success" className="text-[10px]">
                            Activo
                          </Badge>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/alumnos/${s.id}/finanzas`}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[var(--color-surface-hover)]"
                          >
                            Ficha Financiera
                          </Link>

                          <button
                            type="button"
                            onClick={() => openEditDialog(s)}
                            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-white transition-colors"
                            title="Editar datos del alumno"
                          >
                            <Pencil className="size-3.5 text-blue-400" />
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
