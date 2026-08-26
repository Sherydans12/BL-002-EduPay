"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import { communicationsApi, type Course, type Student } from "@/lib/api";
import { fetchAllCourses, fetchAllStudents } from "@/lib/fetch-all-pages";
import { toast } from "sonner";
import { Mail, Send, Sparkles, User, Users } from "lucide-react";

interface SendCustomCommunicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}

export function SendCustomCommunicationModal({
  open,
  onOpenChange,
  onSent,
}: SendCustomCommunicationModalProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [targetType, setTargetType] = useState<"individual" | "course">("individual");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingData(true);

    Promise.all([fetchAllCourses(), fetchAllStudents()])
      .then(([coursesData, studentsData]) => {
        if (!cancelled) {
          setCourses(coursesData);
          setStudents(studentsData);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("Error al cargar lista de cursos y alumnos");
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  // When student selection changes in individual mode
  const handleStudentSelect = (studentIdStr: string) => {
    setSelectedStudentId(studentIdStr);
    const student = students.find((s) => s.id === Number(studentIdStr));
    if (student) {
      const guardian = student.guardian;
      if (guardian?.email) {
        setRecipientEmail(guardian.email);
        setRecipientName(guardian.name);
      } else {
        setRecipientEmail("");
        setRecipientName(student.name);
      }
    }
  };

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error("Por favor completa el asunto y el mensaje");
      return;
    }

    setSending(true);
    try {
      if (targetType === "individual") {
        if (!recipientEmail.trim()) {
          toast.error("El destinatario no tiene un correo válido");
          setSending(false);
          return;
        }

        await communicationsApi.sendCustom({
          recipientEmail: recipientEmail.trim(),
          recipientName: recipientName.trim() || undefined,
          subject: subject.trim(),
          message: message.trim(),
          studentId: selectedStudentId ? Number(selectedStudentId) : undefined,
        });

        toast.success("Comunicación enviada exitosamente");
      } else {
        // Broadcast to course
        const targetStudents = students.filter(
          (s) =>
            selectedCourseId === "" ||
            s.courseId === Number(selectedCourseId),
        );
        const validRecipients = targetStudents.filter(
          (s) => s.guardian?.email && s.guardian.email.trim().length > 0,
        );

        if (validRecipients.length === 0) {
          toast.error("No se encontraron apoderados con correo en el curso seleccionado");
          setSending(false);
          return;
        }

        let sentCount = 0;
        for (const student of validRecipients) {
          try {
            await communicationsApi.sendCustom({
              recipientEmail: student.guardian!.email!.trim(),
              recipientName: student.guardian!.name,
              subject: subject.trim(),
              message: message.trim(),
              studentId: student.id,
              courseId: student.courseId ?? undefined,
            });
            sentCount++;
          } catch {
            // continue loop
          }
        }

        toast.success(`Comunicado enviado a ${sentCount} apoderados`);
      }

      onOpenChange(false);
      // Reset form
      setSubject("");
      setMessage("");
      setSelectedStudentId("");
      setSelectedCourseId("");
      setRecipientEmail("");
      setRecipientName("");
      onSent?.();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al enviar la comunicación",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
              <Mail className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-xl font-bold text-white">
                Redactar Nueva Comunicación
              </DialogTitle>
              <DialogDescription className="text-xs text-[var(--color-text-secondary)]">
                Envía un aviso oficial o informativo directamente al correo del apoderado
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Target type selection */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTargetType("individual")}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all ${
                targetType === "individual"
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-white"
                  : "border-[var(--color-border)] bg-[var(--color-bg)]/40 text-[var(--color-text-muted)] hover:text-white"
              }`}
            >
              <User className="size-4 text-[var(--color-primary)]" />
              Apoderado / Alumno Individual
            </button>
            <button
              type="button"
              onClick={() => setTargetType("course")}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all ${
                targetType === "course"
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-white"
                  : "border-[var(--color-border)] bg-[var(--color-bg)]/40 text-[var(--color-text-muted)] hover:text-white"
              }`}
            >
              <Users className="size-4 text-violet-400" />
              Curso Completo (Masivo)
            </button>
          </div>

          {targetType === "individual" ? (
            <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Seleccionar Alumno
                </label>
                <NativeSelectField
                  value={selectedStudentId}
                  onChange={(e) => handleStudentSelect(e.target.value)}
                  disabled={loadingData}
                  className="mt-1.5 h-10 w-full rounded-xl border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-white"
                >
                  <option value="">Selecciona un alumno...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.course?.name ? `(${s.course.name})` : ""}{" "}
                      {s.guardian?.name ? `— Apod: ${s.guardian.name}` : ""}
                    </option>
                  ))}
                </NativeSelectField>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)]">
                    Nombre Destinatario
                  </label>
                  <Input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Nombre del apoderado"
                    className="mt-1 h-9 border-[var(--color-border)] bg-[var(--color-surface)] text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)]">
                    Email Destinatario *
                  </label>
                  <Input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="correo@ejemplo.cl"
                    className="mt-1 h-9 border-[var(--color-border)] bg-[var(--color-surface)] text-white"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Seleccionar Curso Destino
              </label>
              <NativeSelectField
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                disabled={loadingData}
                className="mt-1.5 h-10 w-full rounded-xl border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-white"
              >
                <option value="">Todos los cursos del colegio</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelectField>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                Se enviará una copia individual del comunicado a todos los apoderados registrados con correo.
              </p>
            </div>
          )}

          {/* Subject & Message */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Asunto del Correo *
              </label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ej: Información sobre proceso de regularización..."
                className="mt-1.5 h-10 border-[var(--color-border)] bg-[var(--color-bg)] text-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Mensaje / Contenido *
                </label>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  Formato texto con saltos de línea
                </span>
              </div>
              <Textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escribe el mensaje formal para el apoderado..."
                className="mt-1.5 resize-none border-[var(--color-border)] bg-[var(--color-bg)] text-white"
              />
            </div>
          </div>

          {/* Live Preview Box */}
          {subject.trim() || message.trim() ? (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-blue-100">
              <p className="flex items-center gap-1.5 font-semibold text-blue-300">
                <Sparkles className="size-3.5" />
                Previsualización en tiempo real
              </p>
              <p className="mt-2 font-medium text-white">
                Asunto: {subject.trim() || "Sin asunto"}
              </p>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[var(--color-text-secondary)]">
                {message.trim() || "Escribe un mensaje para previsualizarlo..."}
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="mt-4 gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={sending || !subject.trim() || !message.trim()}
            onClick={handleSend}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            <Send className="size-4" />
            {sending ? "Enviando..." : "Enviar Comunicación"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
