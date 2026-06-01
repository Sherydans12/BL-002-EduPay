"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paymentSchema, type PaymentFormData } from "@/lib/schemas/payment.schema";
import {
  paymentsApi,
  conceptsApi,
  guardiansApi,
  buildPaymentBatchFormData,
} from "@/lib/api";
import { fetchAllStudents, fetchAllGuardians } from "@/lib/fetch-all-pages";
import type { Student, Guardian, PaymentConcept } from "@/lib/api";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DropdownChevron, NativeSelectField } from "@/components/ui/dropdown-chevron";
import { cmdkCourseFilter, cmdkPersonFilter } from "@/lib/flexible-search";
import { useDropzone } from "react-dropzone";
import { UploadCloud, FileText, X, Info, Trash2, Users, Plus } from "lucide-react";

const METHODS = [
  { value: "CASH", label: "Efectivo" },
  { value: "DEBIT", label: "Débito" },
  { value: "CREDIT", label: "Crédito" },
  { value: "CHECK", label: "Cheque" },
  { value: "TRANSFER", label: "Transferencia" },
] as const;

const inputBase =
  "w-full px-4 py-3 rounded-xl bg-[var(--color-bg)] border text-white focus:ring-1 outline-none transition-all";
const inputOk = `${inputBase} border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]`;
const inputErr = `${inputBase} border-red-500/60 focus:border-red-400 focus:ring-red-400`;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-400 animate-fade-in">{message}</p>;
}

function buildAllocationRow(
  student: Student,
  defaultConcept?: PaymentConcept
): { studentId: number; conceptId: number | undefined; amount: number | undefined } {
  return {
    studentId: student.id,
    conceptId: defaultConcept?.id,
    amount: defaultConcept?.defaultAmount,
  };
}

export default function NewPaymentPage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [concepts, setConcepts] = useState<PaymentConcept[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);
  const [conceptOpenIndex, setConceptOpenIndex] = useState<number | null>(null);
  const [siblingSuggestions, setSiblingSuggestions] = useState<Student[]>([]);

  const defaultConcept = useMemo(
    () => concepts.find((c) => c.isActive) ?? concepts[0],
    [concepts]
  );

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      totalAmount: 0,
      allocations: [],
      method: "CASH",
      paymentDate: new Date().toISOString().split("T")[0],
      payerName: "",
      payerRut: "",
      guardianName: "",
      guardianRut: "",
      guardianEmail: "",
      guardianPhone: "",
      referenceCode: "",
      notes: "",
      boletaNumber: "",
      useAltPayer: false,
      boleta: undefined,
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "allocations",
  });

  const useAltPayer = watch("useAltPayer");
  const allocations = useWatch({ control, name: "allocations" });
  const boletaFile = watch("boleta");

  const studentById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  );

  const primaryStudent = useMemo(() => {
    const firstId = allocations?.[0]?.studentId;
    return firstId ? studentById.get(firstId) : undefined;
  }, [allocations, studentById]);

  useEffect(() => {
    Promise.all([
      fetchAllStudents().then(setStudents),
      fetchAllGuardians().then(setGuardians),
      conceptsApi.getAll().then((data) => setConcepts(data.filter((c) => c.isActive))),
    ]).catch(() => {});
  }, []);

  useEffect(() => {
    const sum =
      allocations?.reduce((acc, row) => acc + (Number(row.amount) || 0), 0) ?? 0;
    setValue("totalAmount", sum, { shouldValidate: true });
  }, [allocations, setValue]);

  const syncGuardianFromStudent = useCallback(
    (student: Student) => {
      if (useAltPayer) return;
      const g = student.guardian;
      setValue("guardianName", g.name ?? "");
      setValue("guardianRut", g.rut ?? "");
      setValue("guardianEmail", g.email ?? "");
      setValue("guardianPhone", g.phone ?? "");
    },
    [useAltPayer, setValue]
  );

  const syncGuardianFromGuardianRecord = useCallback(
    (guardian: Guardian) => {
      if (useAltPayer) return;
      setValue("guardianName", guardian.name ?? "");
      setValue("guardianRut", guardian.rut ?? "");
      setValue("guardianEmail", guardian.email ?? "");
      setValue("guardianPhone", guardian.phone ?? "");
    },
    [useAltPayer, setValue]
  );

  const updateSiblingSuggestions = useCallback(
    (currentIds: Set<number>, guardianId: number) => {
      const siblings = students.filter(
        (s) =>
          s.guardianId === guardianId &&
          !currentIds.has(s.id)
      );
      setSiblingSuggestions(siblings);
    },
    [students]
  );

  const handleSelectGuardian = useCallback(
    (guardian: Guardian) => {
      const children = students.filter((s) => s.guardianId === guardian.id);
      if (children.length === 0) {
        toast.error("Este apoderado no tiene alumnos registrados");
        return;
      }
      replace(children.map((s) => buildAllocationRow(s, defaultConcept)));
      syncGuardianFromGuardianRecord(guardian);
      setSiblingSuggestions([]);
      setGuardianOpen(false);
      toast.success(`${children.length} alumno(s) añadido(s) al pago`);
    },
    [students, replace, defaultConcept, syncGuardianFromGuardianRecord]
  );

  const handleAddStudent = useCallback(
    (student: Student) => {
      const current = getValues("allocations") ?? [];

      append(buildAllocationRow(student, defaultConcept));
      syncGuardianFromStudent(student);

      const nextIds = new Set(current.map((a) => a.studentId));
      nextIds.add(student.id);
      updateSiblingSuggestions(nextIds, student.guardianId);

      setStudentOpen(false);
    },
    [
      append,
      defaultConcept,
      getValues,
      syncGuardianFromStudent,
      updateSiblingSuggestions,
    ]
  );

  const handleAddSibling = useCallback(
    (sibling: Student) => {
      const current = getValues("allocations") ?? [];

      append(buildAllocationRow(sibling, defaultConcept));
      setSiblingSuggestions((prev) => prev.filter((s) => s.id !== sibling.id));

      if (current.length === 0) {
        syncGuardianFromStudent(sibling);
      }
    },
    [append, defaultConcept, getValues, syncGuardianFromStudent]
  );

  const handleConceptSelect = useCallback(
    (index: number, concept: PaymentConcept) => {
      setValue(`allocations.${index}.conceptId`, concept.id, { shouldValidate: true });
      setValue(`allocations.${index}.amount`, concept.defaultAmount, {
        shouldValidate: true,
      });
      setConceptOpenIndex(null);
    },
    [setValue]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        setValue("boleta", acceptedFiles[0], { shouldValidate: true });
      }
    },
    [setValue]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: 10 * 1024 * 1024,
    maxFiles: 1,
    onDropRejected: (fileRejections) => {
      fileRejections.forEach((rejection) => {
        rejection.errors.forEach((err) => {
          if (err.code === "file-too-large") toast.error("El archivo supera los 10MB");
          else if (err.code === "file-invalid-type")
            toast.error("Solo se permiten archivos PDF");
          else toast.error(err.message);
        });
      });
    },
  });

  async function onSubmit(data: PaymentFormData) {
    setSubmitting(true);
    try {
      const firstStudent = students.find((s) => s.id === data.allocations[0]?.studentId);
      if (!data.useAltPayer && firstStudent) {
        await guardiansApi.update(firstStudent.guardianId, {
          name: (data.guardianName ?? "").trim(),
          rut: data.guardianRut?.trim() || null,
          email: data.guardianEmail?.trim() || null,
          phone: data.guardianPhone?.trim() || null,
        });
      }

      const fd = buildPaymentBatchFormData({
        totalAmount: data.totalAmount,
        method: data.method,
        paymentDate: data.paymentDate,
        allocations: data.allocations.map((a) => ({
          studentId: a.studentId,
          conceptId: a.conceptId as number,
          amount: a.amount as number,
        })),
        boletaNumber: data.boletaNumber,
        notes: data.notes,
        boleta: data.boleta,
      });

      await paymentsApi.createBatch(fd);
      toast.success(
        data.allocations.length > 1
          ? `Pago agrupado registrado (${data.allocations.length} alumnos)`
          : "Pago registrado exitosamente"
      );
      reset();
      setSiblingSuggestions([]);
      setTimeout(() => router.push("/reportes"), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al registrar pago";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in pb-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Registrar Pago</h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          Un cobro puede incluir varios alumnos (hermanos) con una sola boleta
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* ── Paso 1: Búsqueda híbrida ─────────────────────── */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
              1
            </span>
            Alumnos del pago
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Buscar por Apoderado
              </label>
              <Popover open={guardianOpen} onOpenChange={setGuardianOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className={`${inputOk} flex items-center gap-2 text-left`}>
                    <Users className="w-4 h-4 shrink-0 text-[var(--color-text-muted)]" />
                    <span className="min-w-0 flex-1 truncate text-[var(--color-text-muted)]">
                      Cargar todos los hijos de un apoderado...
                    </span>
                    <DropdownChevron />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(400px,calc(100vw-2rem))] p-0 z-[60]" align="start">
                  <Command filter={cmdkPersonFilter} className="bg-transparent">
                    <CommandInput placeholder="Nombre o RUT del apoderado..." />
                    <CommandList>
                      <CommandEmpty>No se encontró el apoderado.</CommandEmpty>
                      <CommandGroup>
                        {guardians.map((g) => (
                          <CommandItem
                            key={g.id}
                            value={`${g.name}\t${g.rut ?? ""}`}
                            onSelect={() => handleSelectGuardian(g)}
                            className="cursor-pointer"
                          >
                            <div className="flex flex-col">
                              <span>{g.name}</span>
                              <span className="text-xs text-[var(--color-text-muted)]">
                                {g.rut ?? "Sin RUT"}
                                {g._count?.students != null
                                  ? ` · ${g._count.students} alumno(s)`
                                  : ""}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Buscar por Alumno
              </label>
              <Popover open={studentOpen} onOpenChange={setStudentOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className={`${inputOk} flex items-center gap-2 text-left`}>
                    <span className="min-w-0 flex-1 truncate text-[var(--color-text-muted)]">
                      Añadir un alumno al pago...
                    </span>
                    <DropdownChevron />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(400px,calc(100vw-2rem))] p-0 z-[60]" align="start">
                  <Command filter={cmdkPersonFilter} className="bg-transparent">
                    <CommandInput placeholder="Buscar por nombre o RUT..." />
                    <CommandList>
                      <CommandEmpty>No se encontró el alumno.</CommandEmpty>
                      <CommandGroup>
                        {students.map((s) => (
                          <CommandItem
                            key={s.id}
                            value={`${s.name}\t${s.rut}`}
                            onSelect={() => handleAddStudent(s)}
                            className="cursor-pointer"
                          >
                            <div className="flex flex-col">
                              <span>{s.name}</span>
                              <span className="text-xs text-[var(--color-text-muted)]">
                                {s.rut} — {s.course.name}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {siblingSuggestions.length > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 animate-fade-in space-y-2">
                  <div className="flex items-start gap-2 text-sm text-amber-100/90">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <span>
                      {siblingSuggestions.length === 1
                        ? "Este alumno tiene un hermano registrado:"
                        : "Este alumno tiene hermanos registrados:"}
                    </span>
                  </div>
                  <ul className="space-y-2 pl-6">
                    {siblingSuggestions.map((sibling) => (
                      <li
                        key={sibling.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span className="text-white">
                          {sibling.name}
                          <span className="text-[var(--color-text-muted)] ml-1">
                            ({sibling.course.name})
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddSibling(sibling)}
                          className="px-3 py-1 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-500/30 transition-colors"
                        >
                          Añadir al pago
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <FieldError message={errors.allocations?.message as string | undefined} />

          {fields.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-6 border border-dashed border-[var(--color-border)] rounded-xl">
              Usá los buscadores para añadir alumnos. Podés cargar todos los hijos de un apoderado o
              ir sumando alumnos uno a uno.
            </p>
          ) : (
            <div className="space-y-3">
              {fields.map((field, index) => {
                const student = studentById.get(allocations?.[index]?.studentId);
                const rowConceptId = allocations?.[index]?.conceptId;
                const rowConcept = concepts.find((c) => c.id === rowConceptId);
                const rowErrors = errors.allocations?.[index];

                return (
                  <div
                    key={field.id}
                    className="p-4 rounded-xl bg-[var(--color-bg)]/60 border border-[var(--color-border)] space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate">
                          {student?.name ?? `Alumno #${allocations?.[index]?.studentId}`}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {student?.rut ?? "—"} · {student?.course.name ?? "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (student) append(buildAllocationRow(student, defaultConcept));
                          }}
                          disabled={!student}
                          className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-40"
                          title="Añadir otra glosa a este alumno"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            remove(index);
                            setSiblingSuggestions([]);
                          }}
                          className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Quitar fila"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
                          Concepto *
                        </label>
                        <Controller
                          control={control}
                          name={`allocations.${index}.conceptId`}
                          render={({ field: conceptField }) => (
                            <Popover
                              open={conceptOpenIndex === index}
                              onOpenChange={(open) =>
                                setConceptOpenIndex(open ? index : null)
                              }
                            >
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className={`${rowErrors?.conceptId ? inputErr : inputOk} flex items-center gap-2 text-left py-2.5`}
                                >
                                  <span className="min-w-0 flex-1 truncate text-sm">
                                    {conceptField.value
                                      ? concepts.find((c) => c.id === conceptField.value)?.name
                                      : "Seleccionar concepto..."}
                                  </span>
                                  {rowConcept && (
                                    <span className="shrink-0 text-xs text-[var(--color-text-muted)] font-mono">
                                      ${rowConcept.defaultAmount.toLocaleString("es-CL")}
                                    </span>
                                  )}
                                  <DropdownChevron />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[400px] p-0" align="start">
                                <Command filter={cmdkCourseFilter} className="bg-transparent">
                                  <CommandInput placeholder="Buscar concepto..." />
                                  <CommandList>
                                    <CommandEmpty>No se encontró el concepto.</CommandEmpty>
                                    <CommandGroup>
                                      {concepts.map((c) => (
                                        <CommandItem
                                          key={c.id}
                                          value={c.name}
                                          onSelect={() => handleConceptSelect(index, c)}
                                          className="cursor-pointer"
                                        >
                                          <div className="flex justify-between w-full items-center">
                                            <span>{c.name}</span>
                                            <span className="text-xs text-[var(--color-text-muted)] font-mono tabular-nums">
                                              ${c.defaultAmount.toLocaleString("es-CL")}
                                            </span>
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
                        <FieldError message={rowErrors?.conceptId?.message} />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1.5 uppercase tracking-wider">
                          Monto ($) *
                        </label>
                        <Controller
                          control={control}
                          name={`allocations.${index}.amount`}
                          render={({ field: amountField }) => (
                            <input
                              type="number"
                              min={1}
                              step={1}
                              name={amountField.name}
                              ref={amountField.ref}
                              onBlur={amountField.onBlur}
                              value={amountField.value ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                amountField.onChange(
                                  raw === "" ? undefined : Number(raw)
                                );
                              }}
                              className={`${rowErrors?.amount ? inputErr : inputOk} py-2.5`}
                            />
                          )}
                        />
                        <FieldError message={rowErrors?.amount?.message} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Paso 2: Datos del cobro ──────────────────────── */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white text-sm font-bold">
              2
            </span>
            Datos del Pago
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Monto total ($) *
              </label>
              <input
                type="number"
                min="0"
                readOnly
                {...register("totalAmount", { valueAsNumber: true })}
                className={`${errors.totalAmount ? inputErr : inputOk} text-lg font-semibold bg-[var(--color-surface)]/50 cursor-default`}
              />
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Calculado automáticamente desde las filas de alumnos
              </p>
              <FieldError message={errors.totalAmount?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Método de Pago *
              </label>
              <NativeSelectField>
                <select {...register("method")} className={errors.method ? inputErr : inputOk}>
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </NativeSelectField>
              <FieldError message={errors.method?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Fecha de Pago *
              </label>
              <input
                type="date"
                {...register("paymentDate")}
                className={errors.paymentDate ? inputErr : inputOk}
              />
              <FieldError message={errors.paymentDate?.message} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Código de Referencia
              </label>
              <input
                type="text"
                placeholder="Opcional"
                {...register("referenceCode")}
                className={errors.referenceCode ? inputErr : inputOk}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Notas del cobro
              </label>
              <input
                type="text"
                placeholder="Opcional"
                {...register("notes")}
                className={errors.notes ? inputErr : inputOk}
              />
            </div>
          </div>
        </div>

        {/* ── Paso 3: Pagador ──────────────────────────────── */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white text-sm font-bold">
                3
              </span>
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
            fields.length === 0 ? (
              <p className="text-sm text-amber-200/90">
                Añadí al menos un alumno para cargar los datos del apoderado.
              </p>
            ) : (
              <div className="space-y-4 animate-fade-in">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Datos del apoderado
                  {primaryStudent ? ` (${primaryStudent.guardian.name})` : ""}. Se guardarán al
                  registrar el pago.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                      Nombre del apoderado *
                    </label>
                    <input
                      type="text"
                      autoComplete="name"
                      {...register("guardianName")}
                      className={errors.guardianName ? inputErr : inputOk}
                    />
                    <FieldError message={errors.guardianName?.message} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                      RUT
                    </label>
                    <input
                      type="text"
                      {...register("guardianRut")}
                      className={errors.guardianRut ? inputErr : inputOk}
                    />
                    <FieldError message={errors.guardianRut?.message} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      {...register("guardianPhone")}
                      className={errors.guardianPhone ? inputErr : inputOk}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                      Correo
                    </label>
                    <input
                      type="email"
                      {...register("guardianEmail")}
                      className={errors.guardianEmail ? inputErr : inputOk}
                    />
                    <FieldError message={errors.guardianEmail?.message} />
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Nombre del Pagador *
                </label>
                <input
                  type="text"
                  {...register("payerName")}
                  className={errors.payerName ? inputErr : inputOk}
                />
                <FieldError message={errors.payerName?.message} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  RUT del Pagador
                </label>
                <input
                  type="text"
                  {...register("payerRut")}
                  className={errors.payerRut ? inputErr : inputOk}
                />
                <FieldError message={errors.payerRut?.message} />
              </div>
            </div>
          )}
        </div>

        {/* ── Paso 4: Boleta ───────────────────────────────── */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center text-white text-sm font-bold">
              4
            </span>
            Boleta / Comprobante (única para todo el cobro)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                N° de Boleta
              </label>
              <input
                type="text"
                placeholder="Opcional"
                {...register("boletaNumber")}
                className={errors.boletaNumber ? inputErr : inputOk}
              />
              <FieldError message={errors.boletaNumber?.message} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Archivo PDF de Boleta
              </label>
              <div
                {...getRootProps()}
                className={`w-full px-4 py-6 rounded-xl bg-[var(--color-bg)] border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                  isDragActive
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
                    : errors.boleta
                      ? "border-red-500/60 text-red-400"
                      : "border-[var(--color-border)] hover:border-[var(--color-primary)] text-[var(--color-text-muted)]"
                }`}
              >
                <input {...getInputProps()} />
                {boletaFile ? (
                  <div className="flex items-center justify-between w-full px-2">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileText className="w-8 h-8 text-violet-400 shrink-0" />
                      <div className="text-left overflow-hidden">
                        <p className="text-sm font-medium text-white truncate max-w-[200px]">
                          {boletaFile.name}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {(boletaFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setValue("boleta", undefined, { shouldValidate: true });
                      }}
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
                      <p className="text-xs mt-1 text-[var(--color-text-muted)]">
                        Máximo 10MB (solo PDF)
                      </p>
                    </div>
                  </>
                )}
              </div>
              <FieldError message={errors.boleta?.message} />
            </div>
          </div>
        </div>

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
            disabled={submitting || fields.length === 0}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {submitting
              ? "Registrando..."
              : fields.length > 1
                ? `Registrar pago (${fields.length} alumnos)`
                : "Registrar Pago"}
          </button>
        </div>
      </form>
    </div>
  );
}
