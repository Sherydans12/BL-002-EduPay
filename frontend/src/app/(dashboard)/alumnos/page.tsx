"use client";
import { useEffect, useState } from "react";
import { studentsApi, coursesApi, guardiansApi } from "@/lib/api";
import type { Student, Course, Guardian } from "@/lib/api";

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterCourse, setFilterCourse] = useState("");

  const [rut, setRut] = useState("");
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [guardianId, setGuardianId] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  async function load() {
    try {
      const [s, c, g] = await Promise.all([studentsApi.getAll(), coursesApi.getAll(), guardiansApi.getAll()]);
      setStudents(s); setCourses(c); setGuardians(g);
    } catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function resetForm() { setRut(""); setName(""); setCourseId(""); setGuardianId(""); setEditId(null); setShowForm(false); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const data = { rut, name, courseId: Number(courseId), guardianId: Number(guardianId) };
    try {
      if (editId) await studentsApi.update(editId, data);
      else await studentsApi.create(data);
      resetForm(); load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Error"); }
  }

  function startEdit(s: Student) {
    setEditId(s.id); setRut(s.rut); setName(s.name);
    setCourseId(s.courseId.toString()); setGuardianId(s.guardianId.toString());
    setShowForm(true);
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar este alumno?")) return;
    try { await studentsApi.delete(id); load(); } catch (err: unknown) { setError(err instanceof Error ? err.message : "Error"); }
  }

  const filtered = filterCourse ? students.filter(s => s.courseId === Number(filterCourse)) : students;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Alumnos</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">Gestión de alumnos del colegio</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] text-sm">
          {showForm ? "Cancelar" : "+ Nuevo Alumno"}
        </button>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-5 animate-fade-in">
          <h2 className="text-lg font-semibold text-white">{editId ? "Editar Alumno" : "Nuevo Alumno"}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">RUT *</label>
              <input type="text" value={rut} onChange={(e) => setRut(e.target.value)} required placeholder="12.345.678-9"
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] outline-none transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Nombre *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nombre completo"
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] outline-none transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Curso *</label>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} required
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] outline-none transition-all">
                <option value="">Seleccionar</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Apoderado *</label>
              <select value={guardianId} onChange={(e) => setGuardianId(e.target.value)} required
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] outline-none transition-all">
                <option value="">Seleccionar</option>
                {guardians.map(g => <option key={g.id} value={g.id}>{g.name} — {g.rut}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]">
              {editId ? "Actualizar" : "Guardar"}
            </button>
          </div>
        </form>
      )}

      {/* Filter */}
      <div className="flex items-center gap-4">
        <select value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}
          className="px-4 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-white text-sm focus:border-[var(--color-primary)] outline-none transition-all">
          <option value="">Todos los cursos</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-sm text-[var(--color-text-muted)]">{filtered.length} alumnos</span>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">No hay alumnos registrados</div>
        ) : (
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
                    <button onClick={() => startEdit(s)} className="text-sm text-[var(--color-primary)] hover:underline">Editar</button>
                    <button onClick={() => handleDelete(s.id)} className="text-sm text-red-400 hover:underline">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
