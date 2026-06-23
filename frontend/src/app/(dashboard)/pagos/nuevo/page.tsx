"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  paymentSchema,
  type PaymentFormData,
} from "@/lib/schemas/payment.schema";
import {
  paymentsApi,
  chargesApi,
  guardiansApi,
  buildPaymentBatchFormData,
} from "@/lib/api";
import { fetchAllStudents, fetchAllGuardians } from "@/lib/fetch-all-pages";
import type { Student, Guardian, Charge } from "@/lib/api";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownChevron,
  NativeSelectField,
} from "@/components/ui/dropdown-chevron";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cmdkPersonFilter } from "@/lib/flexible-search";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud,
  FileText,
  X,
  Info,
  Trash2,
  Users,
  Plus,
  Zap,
} from "lucide-react";

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
  return (
    <p className="mt-1.5 text-xs text-red-400 animate-fade-in">{message}</p>
  );
}

function buildAllocationRow(student: Student): {
  studentId: number;
  chargeId: number | undefined;
  conceptId: number | undefined;
  amount: number | undefined;
} {
  return {
    studentId: student.id,
    chargeId: undefined,
    conceptId: undefined,
    amount: undefined,
  };
}

function formatChargeDate(date: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

function getChargeBalance(charge: Charge): number {
  return Math.max(charge.amount - charge.paidAmount, 0);
}

export default function NewPaymentPage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [pendingCharges, setPendingCharges] = useState<
    Record<number, Charge[]>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);
  const [siblingSuggestions, setSiblingSuggestions] = useState<Student[]>([]);

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
    [students],
  );

  const primaryStudent = useMemo(() => {
    const firstId = allocations?.[0]?.studentId;
    return firstId ? studentById.get(firstId) : undefined;
  }, [allocations, studentById]);

  const primaryStudentId = primaryStudent?.id;
  const primaryPendingCharges = primaryStudentId
    ? (pendingCharges[primaryStudentId] ?? [])
    : [];
  const primaryDebtRows = primaryPendingCharges
    .map((charge) => ({
      charge,
      balance: getChargeBalance(charge),
    }))
    .filter((row) => row.balance > 0);
  const primaryDebtTotal = primaryDebtRows.reduce(
    (total, row) => total + row.balance,
    0,
  );

  useEffect(() => {
    Promise.all([
      fetchAllStudents().then(setStudents),
      fetchAllGuardians().then(setGuardians),
    ]).catch(() => {});
  }, []);

  useEffect(() => {
    const sum =
      allocations?.reduce((acc, row) => acc + (Number(row.amount) || 0), 0) ??
      0;
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
    [useAltPayer, setValue],
  );

  const syncGuardianFromGuardianRecord = useCallback(
    (guardian: Guardian) => {
      if (useAltPayer) return;
      setValue("guardianName", guardian.name ?? "");
      setValue("guardianRut", guardian.rut ?? "");
      setValue("guardianEmail", guardian.email ?? "");
      setValue("guardianPhone", guardian.phone ?? "");
    },
    [useAltPayer, setValue],
  );

  const updateSiblingSuggestions = useCallback(
    (currentIds: Set<number>, guardianId: number) => {
      const siblings = students.filter(
        (s) => s.guardianId === guardianId && !currentIds.has(s.id),
      );
      setSiblingSuggestions(siblings);
    },
    [students],
  );

  const loadPendingCharges = useCallback(async (student: Student) => {
    const charges = await chargesApi.getPendingCharges(student.id);
    setPendingCharges((prev) => ({ ...prev, [student.id]: charges }));

    if (charges.length === 0) {
      toast.warning(`${student.name} no tiene cuotas pendientes registradas`);
    }

    return charges;
  }, []);

  const handleSelectGuardian = useCallback(
    async (guardian: Guardian) => {
      const children = students.filter((s) => s.guardianId === guardian.id);
      if (children.length === 0) {
        toast.error("Este apoderado no tiene alumnos registrados");
        return;
      }

      const pendingChild = children.find(
        (child) => child.financialSetup === "PENDING",
      );
      if (pendingChild) {
        toast.error(
          "Alumno sin deuda configurada. Vaya a Setup Financiero primero.",
        );
        return;
      }

      await Promise.all(children.map(loadPendingCharges));
      replace(children.map(buildAllocationRow));
      syncGuardianFromGuardianRecord(guardian);
      setSiblingSuggestions([]);
      setGuardianOpen(false);
      toast.success(`${children.length} alumno(s) añadido(s) al pago`);
    },
    [students, loadPendingCharges, replace, syncGuardianFromGuardianRecord],
  );

  const handleAddStudent = useCallback(
    async (student: Student) => {
      if (student.financialSetup === "PENDING") {
        toast.error(
          "Alumno sin deuda configurada. Vaya a Setup Financiero primero.",
        );
        return;
      }

      const current = getValues("allocations") ?? [];
      await loadPendingCharges(student);

      append(buildAllocationRow(student));
      syncGuardianFromStudent(student);

      const nextIds = new Set(current.map((a) => a.studentId));
      nextIds.add(student.id);
      updateSiblingSuggestions(nextIds, student.guardianId);

      setStudentOpen(false);
    },
    [
      append,
      getValues,
      loadPendingCharges,
      syncGuardianFromStudent,
      updateSiblingSuggestions,
    ],
  );

  const handleAddSibling = useCallback(
    async (sibling: Student) => {
      if (sibling.financialSetup === "PENDING") {
        toast.error(
          "Alumno sin deuda configurada. Vaya a Setup Financiero primero.",
        );
        return;
      }

      const current = getValues("allocations") ?? [];
      await loadPendingCharges(sibling);

      append(buildAllocationRow(sibling));
      setSiblingSuggestions((prev) => prev.filter((s) => s.id !== sibling.id));

      if (current.length === 0) {
        syncGuardianFromStudent(sibling);
      }
    },
    [append, getValues, loadPendingCharges, syncGuardianFromStudent],
  );

  const handleChargeSelect = useCallback(
    (index: number, rawChargeId: string) => {
      const chargeId = Number(rawChargeId);
      const studentId = getValues(`allocations.${index}.studentId`);
      const charge = pendingCharges[studentId]?.find(
        (item) => item.id === chargeId,
      );

      if (!charge) {
        setValue(`allocations.${index}.chargeId`, undefined, {
          shouldValidate: true,
        });
        setValue(`allocations.${index}.conceptId`, undefined, {
          shouldValidate: true,
        });
        setValue(`allocations.${index}.amount`, undefined, {
          shouldValidate: true,
        });
        return;
      }

      setValue(`allocations.${index}.chargeId`, charge.id, {
        shouldValidate: true,
      });
      setValue(`allocations.${index}.conceptId`, charge.conceptId, {
        shouldValidate: true,
      });
      setValue(`allocations.${index}.amount`, getChargeBalance(charge), {
        shouldValidate: true,
      });
    },
    [getValues, pendingCharges, setValue],
  );

  const handleLiquidateStudentDebt = useCallback(() => {
    if (!primaryStudent) return;

    const rows = primaryDebtRows.map(({ charge, balance }) => ({
      studentId: primaryStudent.id,
      chargeId: charge.id,
      conceptId: charge.conceptId,
      amount: balance,
    }));

    if (rows.length === 0) {
      toast.warning(`${primaryStudent.name} no tiene deuda pendiente`);
      return;
    }

    remove();
    rows.forEach((row) => append(row));
    setValue("totalAmount", primaryDebtTotal, { shouldValidate: true });
    toast.success(`Deuda de ${primaryStudent.name} cargada al pago`);
  }, [
    append,
    primaryDebtRows,
    primaryDebtTotal,
    primaryStudent,
    remove,
    setValue,
  ]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        setValue("boleta", acceptedFiles[0], { shouldValidate: true });
      }
    },
    [setValue],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: 10 * 1024 * 1024,
    maxFiles: 1,
    onDropRejected: (fileRejections) => {
      fileRejections.forEach((rejection) => {
        rejection.errors.forEach((err) => {
          if (err.code === "file-too-large")
            toast.error("El archivo supera los 10MB");
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
      const firstStudent = students.find(
        (s) => s.id === data.allocations[0]?.studentId,
      );
      if (!data.useAltPayer && firstStudent) {
        await guardiansApi.update(firstStudent.guardianId, {
          name: (data.guardianName ?? "").trim(),
          rut: data.guardianRut?.trim() || null,
          email: data.guardianEmail?.trim() || null,
          phone: data.guardianPhone?.trim() || null,
        });
      }

      const isBoletaPending = !data.boletaNumber?.trim();

      const fd = buildPaymentBatchFormData({
        totalAmount: data.totalAmount,
        method: data.method,
        paymentDate: data.paymentDate,
        allocations: data.allocations.map((a) => {
          const charge = pendingCharges[a.studentId]?.find(
            (item) => item.id === a.chargeId,
          );

          return {
            studentId: a.studentId,
            chargeId: a.chargeId as number,
            conceptId: charge?.conceptId ?? (a.conceptId as number),
            amount: a.amount as number,
          };
        }),
        boletaNumber: data.boletaNumber,
        isBoletaPending,
        notes: data.notes,
        boleta: data.boleta,
      });

      await paymentsApi.createBatch(fd);
      toast.success(
        data.allocations.length > 1
          ? `Pago agrupado registrado (${data.allocations.length} alumnos)`
          : "Pago registrado exitosamente",
      );
      reset();
      setSiblingSuggestions([]);
      setTimeout(() => router.push("/reportes"), 1500);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al registrar pago";
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

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8"
      >
        <input type="hidden" {...register("totalAmount", { valueAsNumber: true })} />

        <div className="lg:col-span-4 space-y-6">
          <div className="glass rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-white">Controles TPV</h2>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Buscar por Alumno
                </label>
                <Popover open={studentOpen} onOpenChange={setStudentOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`${inputOk} flex items-center gap-2 text-left`}
                    >
                      <span className="min-w-0 flex-1 truncate text-[var(--color-text-muted)]">
                        Añadir un alumno al pago...
                      </span>
                      <DropdownChevron />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[min(400px,calc(100vw-2rem))] p-0 z-[60]"
                    align="start"
                  >
                    <Command filter={cmdkPersonFilter} className="bg-transparent">
                      <CommandInput placeholder="Buscar por nombre o RUT..." />
                      <CommandList>
                        <CommandEmpty>No se encontró el alumno.</CommandEmpty>
                        <CommandGroup>
                          {students.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={`${s.name}\t${s.rut}`}
                              onSelect={() => void handleAddStudent(s)}
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
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Buscar por Apoderado
                </label>
                <Popover open={guardianOpen} onOpenChange={setGuardianOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={`${inputOk} flex items-center gap-2 text-left`}
                    >
                      <Users className="w-4 h-4 shrink-0 text-[var(--color-text-muted)]" />
                      <span className="min-w-0 flex-1 truncate text-[var(--color-text-muted)]">
                        Cargar todos los hijos de un apoderado...
                      </span>
                      <DropdownChevron />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[min(400px,calc(100vw-2rem))] p-0 z-[60]"
                    align="start"
                  >
                    <Command filter={cmdkPersonFilter} className="bg-transparent">
                      <CommandInput placeholder="Nombre o RUT del apoderado..." />
                      <CommandList>
                        <CommandEmpty>No se encontró el apoderado.</CommandEmpty>
                        <CommandGroup>
                          {guardians.map((g) => (
                            <CommandItem
                              key={g.id}
                              value={`${g.name}\t${g.rut ?? ""}`}
                              onSelect={() => void handleSelectGuardian(g)}
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

              {siblingSuggestions.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 animate-fade-in space-y-2">
                  <div className="flex items-start gap-2 text-sm text-amber-100/90">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <span>
                      {siblingSuggestions.length === 1
                        ? "Este alumno tiene un hermano registrado:"
                        : "Este alumno tiene hermanos registrados:"}
                    </span>
                  </div>
                  <ul className="space-y-2">
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
                          onClick={() => void handleAddSibling(sibling)}
                          className="px-3 py-1 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-500/30 transition-colors"
                        >
                          Añadir
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <FieldError
                message={errors.allocations?.message as string | undefined}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-5">
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
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Método de Pago *
                </label>
                <NativeSelectField>
                  <select
                    {...register("method")}
                    className={errors.method ? inputErr : inputOk}
                  >
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </NativeSelectField>
                <FieldError message={errors.method?.message} />
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-white">
              Boleta / Comprobante
            </h2>
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
                className={`w-full px-4 py-8 rounded-xl bg-[var(--color-bg)] border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
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
                      <p className="text-sm text-white">
                        Arrastra y suelta tu archivo aquí
                      </p>
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

          <div className="glass rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-white">Pagador</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register("useAltPayer")}
                  className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] bg-[var(--color-bg)]"
                />
                <span className="text-sm text-[var(--color-text-secondary)]">
                  ¿Paga un tercero?
                </span>
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
                    {primaryStudent ? ` (${primaryStudent.guardian.name})` : ""}.
                  </p>
                  <div className="space-y-4">
                    <div>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
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
                    </div>
                    <div>
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
              <div className="space-y-4 animate-fade-in">
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

          <div className="glass rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-white">Notas</h2>
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

        <div className="lg:col-span-8 space-y-6">
          {primaryStudent && (
            <Card className="border border-emerald-400/20 bg-emerald-950/20 text-white ring-emerald-400/20">
              <CardHeader className="border-b border-emerald-400/10">
                <CardTitle>Resumen de Deuda Pendiente</CardTitle>
                <CardDescription className="text-emerald-100/75">
                  {primaryStudent.name} · {primaryStudent.course.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {primaryDebtRows.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-emerald-300/25 px-4 py-6 text-center text-sm text-emerald-100/75">
                    No hay cuotas pendientes para este alumno.
                  </p>
                ) : (
                  <div className="divide-y divide-emerald-300/10 rounded-xl border border-emerald-300/10 bg-black/10">
                    {primaryDebtRows.map(({ charge, balance }) => (
                      <div
                        key={charge.id}
                        className="flex items-center justify-between gap-4 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {charge.concept.name}
                          </p>
                          <p className="text-xs text-emerald-100/60">
                            Vence: {formatChargeDate(charge.dueDate)}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-emerald-100">
                          {formatCLP(balance)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl bg-emerald-400/10 px-4 py-3">
                  <span className="text-sm font-medium text-emerald-100/80">
                    Total Adeudado
                  </span>
                  <span className="text-xl font-bold text-white">
                    {formatCLP(primaryDebtTotal)}
                  </span>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={handleLiquidateStudentDebt}
                  disabled={primaryDebtRows.length === 0}
                >
                  <Zap className="w-4 h-4" />
                  Liquidar toda la deuda (Auto-completar)
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="glass rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Asignaciones del pago
                </h2>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Cuotas que se pagarán en esta transacción.
                </p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-right">
                <p className="text-xs uppercase text-[var(--color-text-muted)]">
                  Total a cobrar
                </p>
                <p className="text-2xl font-bold text-white">
                  {formatCLP(Number(watch("totalAmount")) || 0)}
                </p>
              </div>
            </div>

            <FieldError message={errors.totalAmount?.message} />

            {fields.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-10 border border-dashed border-[var(--color-border)] rounded-xl">
                Usá los buscadores para añadir alumnos. Al seleccionar uno,
                podés liquidar toda su deuda en un clic.
              </p>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => {
                  const student = studentById.get(
                    allocations?.[index]?.studentId,
                  );
                  const rowStudentId = allocations?.[index]?.studentId;
                  const rowCharges = rowStudentId
                    ? (pendingCharges[rowStudentId] ?? [])
                    : [];
                  const rowChargeId = allocations?.[index]?.chargeId;
                  const rowErrors = errors.allocations?.[index];

                  return (
                    <div
                      key={field.id}
                      className="p-4 rounded-xl bg-[var(--color-bg)]/60 border border-[var(--color-border)] space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-white truncate">
                            {student?.name ??
                              `Alumno #${allocations?.[index]?.studentId}`}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {student?.rut ?? "—"} · {student?.course.name ?? "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (student) append(buildAllocationRow(student));
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
                            Cuota *
                          </label>
                          <NativeSelectField>
                            <select
                              value={rowChargeId ?? ""}
                              onChange={(e) =>
                                handleChargeSelect(index, e.target.value)
                              }
                              className={`${rowErrors?.chargeId ? inputErr : inputOk} py-2.5`}
                              disabled={rowCharges.length === 0}
                            >
                              <option value="">Seleccionar cuota...</option>
                              {rowCharges.map((charge) => (
                                <option key={charge.id} value={charge.id}>
                                  {charge.concept.name} (Vence:{" "}
                                  {formatChargeDate(charge.dueDate)}) - Saldo:{" "}
                                  {formatCLP(getChargeBalance(charge))}
                                </option>
                              ))}
                            </select>
                          </NativeSelectField>
                          {rowCharges.length === 0 && (
                            <p className="mt-1.5 text-xs text-amber-300">
                              No hay cuotas pendientes para este alumno.
                            </p>
                          )}
                          <FieldError message={rowErrors?.chargeId?.message} />
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
                                    raw === "" ? undefined : Number(raw),
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
        </div>
      </form>
    </div>
  );
}
