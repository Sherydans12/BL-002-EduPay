"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paymentSchema, type PaymentFormData } from "@/lib/schemas/payment.schema";
import { studentsApi, coursesApi, paymentsApi } from "@/lib/api";
import type { Student, Course } from "@/lib/api";

const METHODS = [
  { value: "CASH", label: "Efectivo" },
  { value: "DEBIT", label: "Débito" },
  { value: "CREDIT", label: "Crédito" },
  { value: "CHECK", label: "Cheque" },
  { value: "TRANSFER", label: "Transferencia" },
] as const;

/* ─── Helper: clase CSS de inputs con error ─────────────────── */
const inputBase =
  "w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border text-white focus:ring-1 outline-none transition-all";
const inputOk = `${inputBase} border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]`;
const inputErr = `${inputBase} border-red-500/60 focus:border-red-400 focus:ring-red-400`;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs text-red-400 animate-fade-in">{message}</p>
  );
}

export default function NewPaymentPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [courseFilter, setCourseFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PaymentFormData>({
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
    coursesApi.getAll().then(setCourses).catch(() => {});
    studentsApi.getAll().then(setStudents).catch(() => {});
  }, []);

  useEffect(() => {
    if (courseFilter) {
      setFilteredStudents(
        students.filter((s) => s.courseId === Number(courseFilter))
      );
      setValue("studentId", undefined as unknown as number);
    } else {
      setFilteredStudents(students);
    }
  }, [courseFilter, students, setValue]);

  async function onSubmit(data: PaymentFormData) {
    setApiError("");
    setSubmitting(true);

    try {
      const fd = new FormData();
      fd.append("amount", data.amount.toString());
      fd.append("method", data.method);
      fd.append("paymentDate", data.paymentDate);
      fd.append("studentId", data.studentId.toString());

      if (data.useAltPayer && data.payerName)
        fd.append("payerName", data.payerName);
      if (data.useAltPayer && data.payerRut)
        fd.append("payerRut", data.payerRut);
      if (data.referenceCode) fd.append("referenceCode", data.referenceCode);
      if (data.notes) fd.append("notes", data.notes);
      if (data.boletaNumber) fd.append("boletaNumber", data.boletaNumber);
      if (data.boleta) fd.append("boleta", data.boleta);

      await paymentsApi.create(fd);
      setSuccess(true);
      setTimeout(() => router.push("/reportes"), 1500);
    } catch (err: unknown) {
      setApiError(
        err instanceof Error ? err.message : "Error al registrar pago"
      );
    } finally {
      setSubmitting(false);
    }
  }

  /* ─── Success ────────────────────────────────────────────── */
  if (success) {
    return (
      <div className="max-w-2xl mx-auto mt-20 text-center animate-fade-in">
        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-500 to-green-400 flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-6">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white">¡Pago Registrado!</h2>
        <p className="text-[var(--color-text-secondary)] mt-2">Redirigiendo a reportes...</p>
      </div>
    );
  }

  /* ─── Form ───────────────────────────────────────────────── */
  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Registrar Pago</h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          Complete los datos para registrar un nuevo pago
        </p>
      </div>

      {apiError && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {apiError}
        </div>
      )}

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
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                className={inputOk}
              >
                <option value="">Todos los cursos</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Alumno *
              </label>
              <Controller
                control={control}
                name="studentId"
                render={({ field }) => (
                  <select
                    value={field.value ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      field.onChange(v ? Number(v) : undefined);
                    }}
                    className={errors.studentId ? inputErr : inputOk}
                  >
                    <option value="">Seleccionar alumno</option>
                    {filteredStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.rut}
                      </option>
                    ))}
                  </select>
                )}
              />
              <FieldError message={errors.studentId?.message} />
            </div>
          </div>
          {selectedStudent && (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 animate-fade-in">
              <p className="text-sm text-[var(--color-text-secondary)]">
                <strong className="text-white">Apoderado:</strong>{" "}
                {selectedStudent.guardian.name} — {selectedStudent.guardian.rut}
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                <strong className="text-white">Curso:</strong>{" "}
                {selectedStudent.course.name}
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
              <input
                type="number"
                min="1"
                placeholder="0"
                {...register("amount", { valueAsNumber: true })}
                className={`${errors.amount ? inputErr : inputOk} text-lg font-semibold`}
              />
              <FieldError message={errors.amount?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">Método de Pago *</label>
              <select {...register("method")} className={errors.method ? inputErr : inputOk}>
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
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
              <input
                type="checkbox"
                {...register("useAltPayer")}
                className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] bg-[var(--color-bg)]"
              />
              <span className="text-sm text-[var(--color-text-secondary)]">¿Paga un tercero?</span>
            </label>
          </div>
          {!useAltPayer ? (
            <p className="text-sm text-[var(--color-text-muted)] italic">
              El pagador será el apoderado del alumno seleccionado.
            </p>
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
                onClick={() => fileRef.current?.click()}
                className={`w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border border-dashed cursor-pointer hover:border-[var(--color-primary)] transition-all flex items-center gap-3 ${
                  errors.boleta
                    ? "border-red-500/60 text-red-400"
                    : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-sm truncate">
                  {boletaFile?.name || "Seleccionar archivo PDF..."}
                </span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setValue("boleta", file, { shouldValidate: true });
                }}
                className="hidden"
              />
              <FieldError message={errors.boleta?.message} />
            </div>
          </div>
        </div>

        {/* ── Submit ──────────────────────────────────────── */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 rounded-xl text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-all"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Registrando...
              </span>
            ) : (
              "Registrar Pago"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
