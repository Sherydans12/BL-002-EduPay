"use client";
import { useEffect, useState } from "react";
import { guardiansApi } from "@/lib/api";
import type { Guardian } from "@/lib/api";

export default function GuardiansPage() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rut, setRut] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  async function load() {
    try { setGuardians(await guardiansApi.getAll()); } catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function resetForm() { setRut(""); setName(""); setEmail(""); setPhone(""); setEditId(null); setShowForm(false); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const data = { rut, name, email: email || undefined, phone: phone || undefined };
    try {
      if (editId) await guardiansApi.update(editId, data);
      else await guardiansApi.create(data);
      resetForm(); load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Error"); }
  }

  function startEdit(g: Guardian) { setEditId(g.id); setRut(g.rut); setName(g.name); setEmail(g.email || ""); setPhone(g.phone || ""); setShowForm(true); }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar este apoderado?")) return;
    try { await guardiansApi.delete(id); load(); } catch (err: unknown) { setError(err instanceof Error ? err.message : "Error"); }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Apoderados</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">Gestión de apoderados / tutores</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] text-sm">
          {showForm ? "Cancelar" : "+ Nuevo Apoderado"}
        </button>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-5 animate-fade-in">
          <h2 className="text-lg font-semibold text-white">{editId ? "Editar Apoderado" : "Nuevo Apoderado"}</h2>
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
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.cl"
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] outline-none transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Teléfono</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+56 9 1234 5678"
                className="w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-white focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] outline-none transition-all" />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]">
              {editId ? "Actualizar" : "Guardar"}
            </button>
          </div>
        </form>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>
        ) : guardians.length === 0 ? (
          <div className="text-center py-16 text-[var(--color-text-muted)]">No hay apoderados registrados</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg)]/50">
                <th className="px-6 py-4">RUT</th><th className="px-6 py-4">Nombre</th><th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Teléfono</th><th className="px-6 py-4">Alumnos</th><th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {guardians.map((g) => (
                <tr key={g.id} className="hover:bg-[var(--color-surface-hover)] transition-colors">
                  <td className="px-6 py-4 text-sm font-mono text-[var(--color-text-secondary)]">{g.rut}</td>
                  <td className="px-6 py-4 font-medium text-white">{g.name}</td>
                  <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">{g.email || "—"}</td>
                  <td className="px-6 py-4 text-sm text-[var(--color-text-secondary)]">{g.phone || "—"}</td>
                  <td className="px-6 py-4"><span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400">{g._count?.students ?? 0}</span></td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => startEdit(g)} className="text-sm text-[var(--color-primary)] hover:underline">Editar</button>
                    <button onClick={() => handleDelete(g.id)} className="text-sm text-red-400 hover:underline">Eliminar</button>
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
