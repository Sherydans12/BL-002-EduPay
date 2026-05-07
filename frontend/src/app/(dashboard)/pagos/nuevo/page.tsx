"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paymentSchema, type PaymentFormData } from "@/lib/schemas/payment.schema";
import { studentsApi, coursesApi, paymentsApi } from "@/lib/api";
import type { Student, Course } from "@/lib/api";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDropzone } from "react-dropzone";
import { UploadCloud, FileText, X } from "lucide-react";

const METHODS = [
  { value: "CASH", label: "Efectivo" },
  { value: "DEBIT", label: "Débito" },
  { value: "CREDIT", label: "Crédito" },
  { value: "CHECK", label: "Cheque" },
  { value: "TRANSFER", label: "Transferencia" },
] as const;

const inputBase = "w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border text-white focus:ring-1 outline-none transition-all";
const inputOk = `${inputBase} border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]`;
const inputErr = `${inputBase} border-red-500/60 focus:border-red-400 focus:ring-red-400`;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-400 animate-fade-in">{message}</p>;
}

export default function NewPaymentPage() {
  const router = useRouter();

  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [courseFilter, setCourseFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: undefined,
      method: "CASH",
      paymentDate: new Date().toISOString().split("T")[0],
      studentId: undefined,
      payerName: "",
      payerRut: "",
      referenceCode: "",
      notes: "",
      boletaNumber: "",
      useAltPayer: false,
      boleta: undefined,
    },
  });

  const useAltPayer = watch("useAltPayer");
  const studentId = watch("studentId");
  const boletaFile = watch("boleta");
  const selectedStudent = students.find((s) => s.id === studentId);

  useEffect(() => {
    coursesApi.getAll().then((res) => setCourses(res.data)).catch(() => {});
    studentsApi.getAll().then((res) => setStudents(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (courseFilter) {
      setFilteredStudents(students.filter((s) => s.courseId === Number(courseFilter)));
    } else {
      setFilteredStudents(students);
    }
  }, [courseFilter, students]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setValue("boleta", acceptedFiles[0], { shouldValidate: true });
    }
  }, [setValue]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: 10 * 1024 * 1024,
    maxFiles: 1,
    onDropRejected: (fileRejections) => {
      fileRejections.forEach((rejection) => {
        rejection.errors.forEach((err) => {
          if (err.code === "file-too-large") toast.error("El archivo supera los 10MB");
          else if (err.code === "file-invalid-type") toast.error("Solo se permiten archivos PDF");
          else toast.error(err.message);
        });
      });
    }
  });

  async function onSubmit(data: PaymentFormData) {
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("amount", data.amount.toString());
      fd.append("method", data.method);
      fd.append("paymentDate", data.paymentDate);
      fd.append("studentId", data.studentId.toString());

      if (data.useAltPayer && data.payerName) fd.append("payerName", data.payerName);
      if (data.useAltPayer && data.payerRut) fd.append("payerRut", data.payerRut);
      if (data.referenceCode) fd.append("referenceCode", data.referenceCode);
      if (data.notes) fd.append("notes", data.notes);
      if (data.boletaNumber) fd.append("boletaNumber", data.boletaNumber);
      if (data.boleta) fd.append("boleta", data.boleta);

      await paymentsApi.create(fd);
      toast.success("Pago registrado exitosamente");
      reset();
      setTimeout(() => router.push("/reportes"), 1500);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar pago");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Registrar Pago</h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          Complete los datos para registrar un nuevo pago
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* ── Paso 1: Alumno ──────────────────────────────── */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white text-sm font-bold">1</span>
            Seleccionar Alumno
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Curso (filtro opcional)
              </label>
              <select value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setValue("studentId", undefined as any); }} className={inputOk}>
                <option value="">Todos los cursos</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col justify-end">
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Alumno *
              </label>
              <Controller
                control={control}
                name="studentId"
                render={({ field }) => (
                  <Popover open={studentOpen} onOpenChange={setStudentOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={`${errors.studentId ? inputErr : inputOk} text-left flex justify-between items-center`}
                      >
                        {field.value ? students.find(s => s.id === field.value)?.name : "Buscar alumno..."}
                        <span className="text-[var(--color-text-muted)] text-xs">▼</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0 bg-[var(--color-surface)] border-[var(--color-border)] text-white">
                      <Command className="bg-transparent">
                        <CommandInput placeholder="Buscar por nombre o RUT..." className="border-none focus:ring-0" />
                        <CommandList>
                          <CommandEmpty>No se encontró el alumno.</CommandEmpty>
                          <CommandGroup>
                            {filteredStudents.map((s) => (
                              <CommandItem
                                key={s.id}
                                onSelect={() => { field.onChange(s.id); setStudentOpen(false); }}
                                className="cursor-pointer hover:bg-[var(--color-surface-hover)] data-[selected=true]:bg-[var(--color-surface-hover)]"
                              >
                                <div className="flex flex-col">
                                  <span>{s.name}</span>
                                  <span className="text-xs text-[var(--color-text-muted)]">{s.rut} - {s.course.name}</span>
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
              <FieldError message={errors.studentId?.message} />
            </div>
          </div>
          {selectedStudent && (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 animate-fade-in">
              <p className="text-sm text-[var(--color-text-secondary)]">
                <strong className="text-white">Apoderado:</strong> {selectedStudent.guardian.name} — {selectedStudent.guardian.rut}
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                <strong className="text-white">Curso:</strong> {selectedStudent.course.name}
              </p>
            </div>
          )}
        </div>

        {/* ── Paso 2: Datos del Pago ─────────────────────── */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white text-sm font-bold">2</span>
            Datos del Pago
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Monto ($) *</label>
              <input type="number" min="1" placeholder="0" {...register("amount", { valueAsNumber: true })} className={`${errors.amount ? inputErr : inputOk} text-lg font-semibold`} />
              <FieldError message={errors.amount?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Método de Pago *</label>
              <select {...register("method")} className={errors.method ? inputErr : inputOk}>
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <FieldError message={errors.method?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Fecha de Pago *</label>
              <input type="date" {...register("paymentDate")} className={errors.paymentDate ? inputErr : inputOk} />
              <FieldError message={errors.paymentDate?.message} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Código de Referencia</label>
              <input type="text" placeholder="Opcional" {...register("referenceCode")} className={errors.referenceCode ? inputErr : inputOk} />
              <FieldError message={errors.referenceCode?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Notas</label>
              <input type="text" placeholder="Opcional" {...register("notes")} className={errors.notes ? inputErr : inputOk} />
              <FieldError message={errors.notes?.message} />
            </div>
          </div>
        </div>

        {/* ── Paso 3: Pagador ────────────────────────────── */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white text-sm font-bold">3</span>
              Pagador
            </h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register("useAltPayer")} className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] bg-[var(--color-bg)]" />
              <span className="text-sm text-[var(--color-text-secondary)]">¿Paga un tercero?</span>
            </label>
          </div>
          {!useAltPayer ? (
            <p className="text-sm text-[var(--color-text-muted)] italic">El pagador será el apoderado del alumno seleccionado.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Nombre del Pagador *</label>
                <input type="text" placeholder="Nombre completo" {...register("payerName")} className={errors.payerName ? inputErr : inputOk} />
                <FieldError message={errors.payerName?.message} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">RUT del Pagador</label>
                <input type="text" placeholder="12.345.678-9" {...register("payerRut")} className={errors.payerRut ? inputErr : inputOk} />
                <FieldError message={errors.payerRut?.message} />
              </div>
            </div>
          )}
        </div>

        {/* ── Paso 4: Boleta ─────────────────────────────── */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center text-white text-sm font-bold">4</span>
            Boleta / Comprobante
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">N° de Boleta</label>
              <input type="text" placeholder="Opcional" {...register("boletaNumber")} className={errors.boletaNumber ? inputErr : inputOk} />
              <FieldError message={errors.boletaNumber?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Archivo PDF de Boleta</label>
              <div
                {...getRootProps()}
                className={`w-full px-4 py-6 rounded-xl bg-[var(--color-bg)] border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                  isDragActive ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]" : errors.boleta ? "border-red-500/60 text-red-400" : "border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text-muted)]"
                }`}
              >
                <input {...getInputProps()} />
                {boletaFile ? (
                  <div className="flex items-center justify-between w-full px-2">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileText className="w-8 h-8 text-violet-400 shrink-0" />
                      <div className="text-left overflow-hidden">
                        <p className="text-sm font-medium text-white truncate max-w-[200px]">{boletaFile.name}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{(boletaFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setValue("boleta", undefined, { shouldValidate: true }); }}
                      className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="w-10 h-10 text-[var(--color-text-muted)]" />
                    <div className="text-center">
                      <p className="text-sm text-white">Arrastra y suelta tu archivo aquí</p>
                      <p className="text-xs mt-1 text-[var(--color-text-muted)]">Máximo 10MB (solo PDF)</p>
                    </div>
                  </>
                )}
              </div>
              <FieldError message={errors.boleta?.message} />
            </div>
          </div>
        </div>

        {/* ── Submit ──────────────────────────────────────── */}
        <div className="flex justify-end gap-4">
          <button type="button" onClick={() => router.back()} className="px-6 py-3 rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-all">Cancelar</button>
          <button type="submit" disabled={submitting} className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50">
            {submitting ? "Registrando..." : "Registrar Pago"}
          </button>
        </div>
      </form>
    </div>
  );
}
