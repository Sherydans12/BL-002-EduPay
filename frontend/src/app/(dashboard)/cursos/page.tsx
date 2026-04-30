"use client";

import { useEffect, useState } from "react";
import { coursesApi } from "@/lib/api";
import type { Course } from "@/lib/api";

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await coursesApi.getAll();
      setCourses(data);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await coursesApi.create({ name });
      setName("");
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleUpdate(id: number) {
    try {
      await coursesApi.update(id, { name: editName });
      setEditId(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar este curso?")) return;
    try {
      await coursesApi.delete(id);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al eliminar. Puede tener alumnos asociados.");
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Cursos</h1>
        <p className="text-[var(--color-text-secondary)] mt-1">Gestión de cursos del colegio</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Create Form */}
      <form onSubmit={handleCreate} className="glass rounded-2xl p-6 flex gap-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del curso (ej: 1° Básico A)"
          required
          className="flex-1 px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] outline-none transition-all"
        />
        <button
          type="submit"
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          Agregar
        </button>
      </form>

      {/* List */}
      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">
            No hay cursos registrados
          </div>
        ) : (
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
              {courses.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                  <td className="px-6 py-4 text-sm text-[var(--color-text-muted)]">#{c.id}</td>
                  <td className="px-6 py-4">
                    {editId === c.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleUpdate(c.id)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-primary)] text-white text-sm outline-none"
                        autoFocus
                      />
                    ) : (
                      <span className="font-medium text-white">{c.name}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400">
                      {c._count?.students ?? 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    {editId === c.id ? (
                      <>
                        <button onClick={() => handleUpdate(c.id)} className="text-sm text-emerald-400 hover:underline">
                          Guardar
                        </button>
                        <button onClick={() => setEditId(null)} className="text-sm text-[var(--color-text-muted)] hover:underline">
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditId(c.id); setEditName(c.name); }}
                          className="text-sm text-[var(--color-primary)] hover:underline"
                        >
                          Editar
                        </button>
                        <button onClick={() => handleDelete(c.id)} className="text-sm text-red-400 hover:underline">
                          Eliminar
                        </button>
                      </>
                    )}
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
