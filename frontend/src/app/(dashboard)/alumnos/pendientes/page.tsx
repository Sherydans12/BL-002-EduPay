"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { studentsApi, type PendingStudentReviewItem } from "@/lib/api";
import { validateNameTokenPreservation } from "@/lib/name-validation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  UserCheck,
  RefreshCw,
  GraduationCap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function NameReviewQueuePage() {
  const [queue, setQueue] = useState<PendingStudentReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await studentsApi.getNameReviewQueue();
      setQueue(res.data);
      setSelectedIndex(0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar cola de pendientes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
  }, []);

  const currentStudent = queue[selectedIndex] ?? null;

  // Initialize or reset form fields when selected student changes
  useEffect(() => {
    if (!currentStudent) {
      setFirstName("");
      setLastName("");
      return;
    }

    // Default suggestions for 3-token name if fields are blank
    const tokens = currentStudent.name.trim().split(/\s+/).filter(Boolean);
    if (currentStudent.firstName && currentStudent.lastName) {
      setFirstName(currentStudent.firstName);
      setLastName(currentStudent.lastName);
    } else if (tokens.length === 3) {
      // Standard institutional default suggestion: first 2 tokens = surname, 3rd = given name
      setLastName(`${tokens[0]} ${tokens[1]}`);
      setFirstName(tokens[2]);
    } else if (tokens.length === 2) {
      setLastName(tokens[0]);
      setFirstName(tokens[1]);
    } else {
      setFirstName("");
      setLastName("");
    }
  }, [currentStudent]);

  const validation = useMemo(() => {
    if (!currentStudent) return { valid: false, reason: "" };
    return validateNameTokenPreservation(currentStudent.name, firstName, lastName);
  }, [currentStudent, firstName, lastName]);

  const handleApplySplit = (suggestedLast: string, suggestedFirst: string) => {
    setLastName(suggestedLast);
    setFirstName(suggestedFirst);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStudent) return;

    if (!validation.valid) {
      toast.error(validation.reason || "Partición de nombres inválida");
      return;
    }

    setSaving(true);
    try {
      await studentsApi.reviewName(currentStudent.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      toast.success(`Estructuración guardada para ${currentStudent.name}`);

      // Remove current student from queue
      const nextQueue = queue.filter((s) => s.id !== currentStudent.id);
      setQueue(nextQueue);

      if (selectedIndex >= nextQueue.length) {
        setSelectedIndex(Math.max(0, nextQueue.length - 1));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar estructuración");
    } finally {
      setSaving(false);
    }
  };

  const tokens = useMemo(() => {
    if (!currentStudent) return [];
    return currentStudent.name.trim().split(/\s+/).filter(Boolean);
  }, [currentStudent]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <Link
            href="/alumnos"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver a Alumnos
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              Pendientes de sincronización con Académico
            </h1>
            <Badge variant={queue.length > 0 ? "secondary" : "outline"} className="text-sm">
              Pendientes: {queue.length}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Estructuración controlada de nombres para alumnos activos antes de sincronizar con Académico.
          </p>
        </div>

        <button
          onClick={() => void loadQueue()}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar cola
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 opacity-50" />
          <p>Cargando alumnos pendientes de estructuración…</p>
        </div>
      ) : queue.length === 0 ? (
        /* Empty / All Done State */
        <div className="rounded-xl border bg-card p-12 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto dark:bg-emerald-950/50 dark:text-emerald-400">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-semibold">¡Todo listo para sincronizar!</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Todos los alumnos activos están listos para sincronizar con Académico. No quedan registros pendientes de partición de nombres.
          </p>
          <div className="pt-2">
            <Link
              href="/alumnos"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Ir al listado de Alumnos
            </Link>
          </div>
        </div>
      ) : (
        /* Queue View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Review Form Card */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-xl border bg-card p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b pb-3">
                <span className="text-sm font-medium text-muted-foreground">
                  Alumno {selectedIndex + 1} de {queue.length}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <AlertCircle className="w-3.5 h-3.5" />
                  STUDENT_STRUCTURED_NAME_MISSING
                </span>
              </div>

              {/* Original Record Summary */}
              <div className="bg-muted/40 p-4 rounded-lg space-y-2 border">
                <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                  Nombre original en fuente (inmutable)
                </div>
                <div className="text-xl font-bold tracking-tight text-foreground">
                  {currentStudent?.name}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                  <span className="inline-flex items-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5" />
                    Curso: <strong className="text-foreground">{currentStudent?.course?.name || "Sin curso"}</strong>
                  </span>
                  <span>
                    Estado: <strong className="text-foreground">{currentStudent?.status}</strong>
                  </span>
                  <span>
                    Palabras: <strong className="text-foreground">{tokens.length}</strong>
                  </span>
                </div>
              </div>

              {/* Quick partition suggestions if 3 tokens */}
              {tokens.length === 3 && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Sugerencias de partición semántica:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplySplit(`${tokens[0]} ${tokens[1]}`, tokens[2])}
                      className="text-xs border rounded-md px-2.5 py-1.5 bg-background hover:bg-accent transition-colors text-left"
                    >
                      <strong>2 Apellidos + 1 Nombre:</strong>
                      <div className="text-muted-foreground">
                        Apellidos: &quot;{tokens[0]} {tokens[1]}&quot; | Nombres: &quot;{tokens[2]}&quot;
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplySplit(tokens[0], `${tokens[1]} ${tokens[2]}`)}
                      className="text-xs border rounded-md px-2.5 py-1.5 bg-background hover:bg-accent transition-colors text-left"
                    >
                      <strong>1 Apellido + 2 Nombres:</strong>
                      <div className="text-muted-foreground">
                        Apellidos: &quot;{tokens[0]}&quot; | Nombres: &quot;{tokens[1]} {tokens[2]}&quot;
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Review Form */}
              <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="lastName" className="text-sm font-medium">
                    Apellidos (Ap. Paterno y Materno) <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="p. ej. Escobar Marín"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="firstName" className="text-sm font-medium">
                    Nombres <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="p. ej. Vicente"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>

                {/* Live Token Preservation Validation Feedback */}
                <div
                  className={`p-3 rounded-md text-xs border flex items-start gap-2 ${
                    validation.valid
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
                      : "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
                  }`}
                >
                  {validation.valid ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Partición válida:</strong> Todas las palabras del nombre original ({tokens.length}) están exactamente conservadas en los campos de Apellidos y Nombres.
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Validación de preservación de palabras:</strong> {validation.reason}
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={selectedIndex === 0}
                      onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
                      className="px-3 py-2 text-sm rounded-md border border-input bg-background hover:bg-accent disabled:opacity-40 transition-colors"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      disabled={selectedIndex >= queue.length - 1}
                      onClick={() => setSelectedIndex((prev) => Math.min(queue.length - 1, prev + 1))}
                      className="px-3 py-2 text-sm rounded-md border border-input bg-background hover:bg-accent disabled:opacity-40 transition-colors"
                    >
                      Siguiente
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={!validation.valid || saving}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    <UserCheck className="w-4 h-4" />
                    {saving ? "Guardando…" : "Guardar y avanzar"}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Queue Sidebar */}
          <div className="space-y-3">
            <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-semibold text-sm">Cola de alumnos ({queue.length})</h3>
                <span className="text-xs text-muted-foreground">Clic para editar</span>
              </div>
              <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
                {queue.map((student, idx) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => setSelectedIndex(idx)}
                    className={`w-full text-left p-2.5 rounded-md text-xs transition-colors border ${
                      idx === selectedIndex
                        ? "bg-accent border-primary text-foreground font-semibold shadow-xs"
                        : "bg-background hover:bg-muted/60 border-transparent text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate">{student.name}</span>
                      <span className="text-[10px] opacity-70 ml-2 shrink-0">
                        {student.course?.name || "S/C"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
