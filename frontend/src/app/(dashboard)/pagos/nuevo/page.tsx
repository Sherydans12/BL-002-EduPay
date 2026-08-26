"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
  conceptsApi,
  buildPaymentBatchFormData,
} from "@/lib/api";
import { fetchAllStudents, fetchAllGuardians } from "@/lib/fetch-all-pages";
import type { Student, Guardian, Charge, PaymentConcept } from "@/lib/api";
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
} from "@/components/ui/dropdown-chevron";
import { cmdkPersonFilter } from "@/lib/flexible-search";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud,
  FileText,
  X,
  Users,
  Search,
  ArrowLeft,
  Calendar,
  Sparkles,
  Keyboard,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Plus,
  Lock,
} from "lucide-react";
import { StudentChargesCard } from "./StudentChargesCard";
import { PaymentMethodDetails } from "./PaymentMethodDetails";
import { PaymentReceiptModal, type ReceiptData } from "./PaymentReceiptModal";

const inputBase =
  "w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-bg)] border text-white focus:ring-1 outline-none transition-all text-sm";
const inputOk = `${inputBase} border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]`;
const inputErr = `${inputBase} border-red-500/60 focus:border-red-400 focus:ring-red-400`;
const inputReadOnly = `${inputBase} border-[var(--color-border)]/50 bg-[var(--color-bg)]/50 text-[var(--color-text-muted)] cursor-not-allowed select-none font-mono`;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-red-400 animate-fade-in">{message}</p>
  );
}

function formatCLP(amount: number): string {
  return amount.toLocaleString("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
}

function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export default function NewPaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStudentId = Number(searchParams.get("studentId"));
  const autoSelectedStudentIdRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [concepts, setConcepts] = useState<PaymentConcept[]>([]);
  const [pendingCharges, setPendingCharges] = useState<Record<number, Charge[]>>({});
  const [loadingCharges, setLoadingCharges] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  // Search popovers
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<"STUDENT" | "GUARDIAN">("STUDENT");

  // Selected students tracked as an ordered list of student IDs
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);

  // Boleta mode: "EMITTED" (has SII boleta now) vs "PENDING" (emit later)
  const [boletaMode, setBoletaMode] = useState<"EMITTED" | "PENDING">("EMITTED");

  // Track initial presence of guardian contact data to lock registered fields
  const [initialGuardianState, setInitialGuardianState] = useState<{
    hasRut: boolean;
    hasPhone: boolean;
    hasEmail: boolean;
  }>({
    hasRut: false,
    hasPhone: false,
    hasEmail: false,
  });

  // Success modal state
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

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
      paymentDate: getTodayString(),
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
  const selectedMethod = watch("method");
  const paymentDate = watch("paymentDate");
  const referenceCode = watch("referenceCode") ?? "";
  const notes = watch("notes") ?? "";

  const studentById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const selectedStudents = useMemo(() => {
    const uniqueIds = Array.from(new Set(selectedStudentIds));
    return uniqueIds
      .map((id) => studentById.get(id))
      .filter((s): s is Student => Boolean(s));
  }, [selectedStudentIds, studentById]);

  const primaryStudent = selectedStudents[0];

  // Load students, guardians, and concepts on mount
  useEffect(() => {
    Promise.all([
      fetchAllStudents().then(setStudents),
      fetchAllGuardians().then(setGuardians),
      conceptsApi.getAll().then(setConcepts).catch(() => []),
    ])
      .catch(() => {})
      .finally(() => setStudentsLoaded(true));
  }, []);

  // Update totalAmount whenever allocations change
  useEffect(() => {
    const sum =
      allocations?.reduce((acc, row) => acc + (Number(row.amount) || 0), 0) ??
      0;
    setValue("totalAmount", sum, { shouldValidate: true });
  }, [allocations, setValue]);

  // Sync guardian fields from student
  const syncGuardianFromStudent = useCallback(
    (student: Student) => {
      if (useAltPayer) return;
      const g = student.guardian;
      if (!g) return;
      setValue("guardianName", g.name ?? "");
      setValue("guardianRut", g.rut ?? "");
      setValue("guardianEmail", g.email ?? "");
      setValue("guardianPhone", g.phone ?? "");

      setInitialGuardianState({
        hasRut: Boolean(g.rut && g.rut.trim().length > 0),
        hasPhone: Boolean(g.phone && g.phone.trim().length > 0),
        hasEmail: Boolean(g.email && g.email.trim().length > 0),
      });
    },
    [useAltPayer, setValue],
  );

  // Sync guardian fields from guardian record
  const syncGuardianFromGuardianRecord = useCallback(
    (guardian: Guardian) => {
      if (useAltPayer) return;
      setValue("guardianName", guardian.name ?? "");
      setValue("guardianRut", guardian.rut ?? "");
      setValue("guardianEmail", guardian.email ?? "");
      setValue("guardianPhone", guardian.phone ?? "");

      setInitialGuardianState({
        hasRut: Boolean(guardian.rut && guardian.rut.trim().length > 0),
        hasPhone: Boolean(guardian.phone && guardian.phone.trim().length > 0),
        hasEmail: Boolean(guardian.email && guardian.email.trim().length > 0),
      });
    },
    [useAltPayer, setValue],
  );

  // Load pending charges for a student
  const loadPendingCharges = useCallback(async (student: Student) => {
    setLoadingCharges((prev) => ({ ...prev, [student.id]: true }));
    try {
      const charges = await chargesApi.getPendingCharges(student.id);
      setPendingCharges((prev) => ({ ...prev, [student.id]: charges }));
      return charges;
    } catch {
      toast.error(`Error al cargar cuotas de ${student.name}`);
      return [];
    } finally {
      setLoadingCharges((prev) => ({ ...prev, [student.id]: false }));
    }
  }, []);

  // Add a student to the payment view
  const handleAddStudent = useCallback(
    async (student: Student, autoSelectCharges = true) => {
      if (student.financialSetup === "PENDING") {
        toast.error(
          "Alumno sin deuda configurada. Vaya a Setup Financiero primero.",
        );
        return;
      }

      let alreadyAdded = false;
      setSelectedStudentIds((prev) => {
        if (prev.includes(student.id)) {
          alreadyAdded = true;
          return prev;
        }
        return [...prev, student.id];
      });

      if (alreadyAdded) {
        toast.info(`${student.name} ya está en la lista`);
        return;
      }

      const charges = await loadPendingCharges(student);

      if (selectedStudentIds.length === 0) {
        syncGuardianFromStudent(student);
      }

      // Auto-select pending charges for quick cashier flow if available
      if (autoSelectCharges && charges.length > 0) {
        const currentAllocations = getValues("allocations") ?? [];
        const existingChargeIds = new Set(
          currentAllocations.map((a) => a.chargeId).filter(Boolean)
        );

        charges.forEach((charge) => {
          if (!existingChargeIds.has(charge.id)) {
            const balance = Math.max(charge.amount - charge.paidAmount, 0);
            if (balance > 0) {
              append({
                studentId: student.id,
                chargeId: charge.id,
                conceptId: charge.conceptId,
                amount: balance,
              });
            }
          }
        });
      }

      setSearchOpen(false);
      toast.success(`${student.name} añadido al cobro`);
    },
    [
      append,
      getValues,
      loadPendingCharges,
      selectedStudentIds.length,
      syncGuardianFromStudent,
    ],
  );

  // Select a guardian and load all of their children
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
          "Hay alumnos con setup financiero pendiente. Configure primero.",
        );
        return;
      }

      // Clear existing allocations and load all children
      remove();
      const uniqueChildrenIds = Array.from(new Set(children.map((c) => c.id)));
      setSelectedStudentIds(uniqueChildrenIds);
      syncGuardianFromGuardianRecord(guardian);

      for (const child of children) {
        const charges = await loadPendingCharges(child);
        charges.forEach((charge) => {
          const balance = Math.max(charge.amount - charge.paidAmount, 0);
          if (balance > 0) {
            append({
              studentId: child.id,
              chargeId: charge.id,
              conceptId: charge.conceptId,
              amount: balance,
            });
          }
        });
      }

      setSearchOpen(false);
      toast.success(`${children.length} alumno(s) cargado(s) para ${guardian.name}`);
    },
    [
      append,
      loadPendingCharges,
      remove,
      students,
      syncGuardianFromGuardianRecord,
    ],
  );

  // Auto-select requested student from URL query param if present
  useEffect(() => {
    if (
      !studentsLoaded ||
      !Number.isInteger(requestedStudentId) ||
      requestedStudentId <= 0 ||
      autoSelectedStudentIdRef.current === requestedStudentId
    ) {
      return;
    }

    const requestedStudent = students.find(
      (student) => student.id === requestedStudentId,
    );

    autoSelectedStudentIdRef.current = requestedStudentId;

    if (!requestedStudent) {
      toast.error("No se encontró el alumno indicado en el enlace");
      return;
    }

    void handleAddStudent(requestedStudent);
  }, [
    handleAddStudent,
    requestedStudentId,
    students,
    studentsLoaded,
  ]);

  // Remove a student and all their allocations
  const handleRemoveStudent = useCallback(
    (studentId: number) => {
      setSelectedStudentIds((prev) => {
        const next = prev.filter((id) => id !== studentId);
        if (next.length === 0) {
          setInitialGuardianState({
            hasRut: false,
            hasPhone: false,
            hasEmail: false,
          });
        }
        return next;
      });
      const currentAllocations = getValues("allocations") ?? [];
      const filtered = currentAllocations.filter((a) => a.studentId !== studentId);
      replace(filtered);
    },
    [getValues, replace],
  );

  // Toggle individual charge on/off
  const handleToggleCharge = useCallback(
    (charge: Charge, checked: boolean) => {
      const currentAllocations = getValues("allocations") ?? [];
      if (checked) {
        const balance = Math.max(charge.amount - charge.paidAmount, 0);
        append({
          studentId: charge.studentId,
          chargeId: charge.id,
          conceptId: charge.conceptId,
          amount: balance > 0 ? balance : charge.amount,
        });
      } else {
        const filtered = currentAllocations.filter((a) => a.chargeId !== charge.id);
        replace(filtered);
      }
    },
    [append, getValues, replace],
  );

  // Change amount on a selected charge
  const handleAmountChange = useCallback(
    (chargeId: number, amount: number | undefined) => {
      const currentAllocations = getValues("allocations") ?? [];
      const index = currentAllocations.findIndex((a) => a.chargeId === chargeId);
      if (index !== -1) {
        setValue(`allocations.${index}.amount`, amount, { shouldValidate: true });
      }
    },
    [getValues, setValue],
  );

  // Select all charges for a student
  const handleSelectAllCharges = useCallback(
    (studentId: number) => {
      const charges = pendingCharges[studentId] ?? [];
      const currentAllocations = getValues("allocations") ?? [];
      const otherAllocations = currentAllocations.filter((a) => a.studentId !== studentId);

      const allStudentAllocations = charges.map((c) => ({
        studentId,
        chargeId: c.id,
        conceptId: c.conceptId,
        amount: Math.max(c.amount - c.paidAmount, 0),
      }));

      replace([...otherAllocations, ...allStudentAllocations]);
    },
    [getValues, pendingCharges, replace],
  );

  // Select only overdue charges for a specific student
  const handleSelectOverdueCharges = useCallback(
    (studentId: number) => {
      const charges = pendingCharges[studentId] ?? [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const currentAllocations = getValues("allocations") ?? [];
      const otherAllocations = currentAllocations.filter((a) => a.studentId !== studentId);

      const overdueAllocations = charges
        .filter((c) => new Date(c.dueDate) < today && c.amount - c.paidAmount > 0)
        .map((c) => ({
          studentId,
          chargeId: c.id,
          conceptId: c.conceptId,
          amount: Math.max(c.amount - c.paidAmount, 0),
        }));

      replace([...otherAllocations, ...overdueAllocations]);
    },
    [getValues, pendingCharges, replace],
  );

  // Clear all charges for a student
  const handleClearCharges = useCallback(
    (studentId: number) => {
      const currentAllocations = getValues("allocations") ?? [];
      const filtered = currentAllocations.filter((a) => a.studentId !== studentId);
      replace(filtered);
    },
    [getValues, replace],
  );

  // Add a standalone custom credit (abono libre / saldo a favor) for a student
  const handleAddCustomCredit = useCallback(
    (studentId: number, conceptId: number, amount: number) => {
      append({
        studentId,
        chargeId: undefined,
        conceptId,
        amount,
      });
      toast.success(`Abono a cuenta de ${formatCLP(amount)} añadido`);
    },
    [append],
  );

  // Sibling suggestions for each student
  const getSiblingSuggestions = useCallback(
    (student: Student) => {
      const currentSet = new Set(selectedStudentIds);
      return students.filter(
        (s) => s.guardianId === student.guardianId && !currentSet.has(s.id),
      );
    },
    [selectedStudentIds, students],
  );

  // Dropzone for boleta PDF
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        setValue("boleta", acceptedFiles[0], { shouldValidate: true });
        setBoletaMode("EMITTED");
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

  // Global keyboard shortcuts (Ctrl+Enter for Submit, Ctrl+F for Search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        const submitBtn = document.getElementById("submit-payment-btn");
        if (submitBtn) submitBtn.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Form submit handler
  async function onSubmit(data: PaymentFormData) {
    if (data.allocations.length === 0) {
      toast.error("Debe seleccionar al menos una cuota o abono para registrar el pago");
      return;
    }

    setSubmitting(true);
    try {
      const firstStudent = students.find(
        (s) => s.id === data.allocations[0]?.studentId,
      );
      if (!data.useAltPayer && firstStudent) {
        const updatePayload: {
          name: string;
          rut?: string;
          email?: string;
          phone?: string;
        } = {
          name: (data.guardianName ?? "").trim(),
        };

        if (data.guardianRut?.trim()) {
          updatePayload.rut = data.guardianRut.trim();
        }
        if (data.guardianEmail?.trim()) {
          updatePayload.email = data.guardianEmail.trim();
        }
        if (data.guardianPhone?.trim()) {
          updatePayload.phone = data.guardianPhone.trim();
        }

        try {
          await guardiansApi.update(firstStudent.guardianId, updatePayload);
        } catch (updateErr) {
          console.warn("No se pudieron actualizar los datos del apoderado:", updateErr);
        }
      }

      const isBoletaPending = boletaMode === "PENDING" || !data.boletaNumber?.trim();

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
            chargeId: a.chargeId ? (a.chargeId as number) : undefined,
            conceptId: charge?.conceptId ?? (a.conceptId as number),
            amount: a.amount as number,
          };
        }),
        boletaNumber: boletaMode === "EMITTED" ? data.boletaNumber : undefined,
        isBoletaPending,
        notes: data.notes,
        boleta: boletaMode === "EMITTED" ? data.boleta : undefined,
      });

      const response = await paymentsApi.createBatch(fd);
      const groupId = response && typeof response === "object" && "id" in response
        ? Number((response as { id: number }).id)
        : undefined;

      // Prepare receipt data
      const receiptItems = data.allocations.map((a) => {
        const student = studentById.get(a.studentId);
        const charge = pendingCharges[a.studentId]?.find((c) => c.id === a.chargeId);
        const conceptObj = concepts.find((c) => c.id === (charge?.conceptId ?? a.conceptId));
        const conceptName = charge?.concept?.name ?? conceptObj?.name ?? "Abono a Cuenta";
        return {
          studentName: student?.name ?? `Alumno #${a.studentId}`,
          courseName: student?.course?.name,
          rut: student?.rut,
          conceptName: a.chargeId ? conceptName : `Abono Libre / Saldo a Favor (${conceptName})`,
          amount: a.amount as number,
        };
      });

      setReceiptData({
        groupId,
        paymentDate: data.paymentDate,
        totalAmount: data.totalAmount,
        method: data.method,
        referenceCode: data.referenceCode,
        boletaNumber: boletaMode === "EMITTED" ? data.boletaNumber : undefined,
        isBoletaPending,
        payerName: data.useAltPayer ? data.payerName : undefined,
        guardianName: !data.useAltPayer ? data.guardianName : undefined,
        notes: data.notes,
        items: receiptItems,
      });

      // Clear the background form state immediately so no stale data remains behind the modal
      reset({
        totalAmount: 0,
        allocations: [],
        method: "CASH",
        paymentDate: getTodayString(),
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
      });
      setSelectedStudentIds([]);
      setBoletaMode("EMITTED");
      setInitialGuardianState({ hasRut: false, hasPhone: false, hasEmail: false });

      setReceiptModalOpen(true);
      toast.success(
        data.allocations.length > 1
          ? `Pago agrupado registrado exitosamente (${data.allocations.length} cuotas/abonos)`
          : "Pago registrado exitosamente",
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al registrar pago";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const handleStartNewPayment = () => {
    setReceiptModalOpen(false);
    reset({
      totalAmount: 0,
      allocations: [],
      method: "CASH",
      paymentDate: getTodayString(),
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
    });
    setSelectedStudentIds([]);
    setBoletaMode("EMITTED");
    setInitialGuardianState({ hasRut: false, hasPhone: false, hasEmail: false });
  };

  const totalAmountValue = Number(watch("totalAmount")) || 0;
  const totalAllocationsCount = fields.length;

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-16 space-y-6">
      {/* Cabecera Principal con Navegación y Atajos */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Link
              href="/pagos"
              className="p-2 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-white hover:border-[var(--color-border-subtle)] transition-all"
              title="Volver al historial de pagos"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <span>Punto de Venta / Registro de Pago</span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] pl-11">
            Cobro rápido en ventanilla con soporte multi-alumno, cálculo de vuelto y comprobante de caja.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto pl-11 md:pl-0">
          <span className="text-[11px] text-[var(--color-text-muted)] hidden lg:inline-flex items-center gap-1.5 bg-[var(--color-bg)] px-3 py-1.5 rounded-lg border border-[var(--color-border)]">
            <Keyboard className="w-3.5 h-3.5 text-blue-400" />
            Atajos: <kbd className="font-mono bg-[var(--color-surface)] px-1 rounded text-white">Ctrl+F</kbd> Buscar · <kbd className="font-mono bg-[var(--color-surface)] px-1 rounded text-white">Ctrl+Enter</kbd> Cobrar
          </span>
        </div>
      </div>

      {/* Buscador Universal Rápido */}
      <div className="glass rounded-2xl p-4 sm:p-5 border border-[var(--color-border)] shadow-md">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="flex-1">
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`${inputOk} flex items-center justify-between gap-3 text-left py-3 cursor-pointer shadow-inner`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Search className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="min-w-0 truncate text-[var(--color-text-secondary)] text-sm">
                      {searchMode === "STUDENT"
                        ? "Buscar alumno por nombre, apellido o RUT (Ctrl+F)..."
                        : "Buscar apoderado para cargar todos sus hijos..."}
                    </span>
                  </div>
                  <DropdownChevron />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[min(550px,calc(100vw-2rem))] p-0 z-[60] bg-[var(--color-surface)] border-[var(--color-border)] text-white shadow-2xl"
                align="start"
              >
                <div className="flex items-center border-b border-[var(--color-border)] p-2 gap-1 bg-[var(--color-bg)]/80">
                  <button
                    type="button"
                    onClick={() => setSearchMode("STUDENT")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      searchMode === "STUDENT"
                        ? "bg-blue-600 text-white shadow"
                        : "text-[var(--color-text-secondary)] hover:text-white"
                    }`}
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Por Alumno
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode("GUARDIAN")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      searchMode === "GUARDIAN"
                        ? "bg-blue-600 text-white shadow"
                        : "text-[var(--color-text-secondary)] hover:text-white"
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Por Apoderado (Cargar Hermanos)
                  </button>
                </div>

                <Command filter={cmdkPersonFilter} className="bg-transparent">
                  <CommandInput
                    ref={searchInputRef}
                    placeholder={
                      searchMode === "STUDENT"
                        ? "Escribe nombre, apellido o RUT del alumno..."
                        : "Escribe nombre o RUT del apoderado..."
                    }
                    className="text-white placeholder:text-[var(--color-text-muted)]"
                  />
                  <CommandList className="max-h-72">
                    <CommandEmpty className="py-6 text-center text-xs text-[var(--color-text-muted)]">
                      No se encontraron resultados.
                    </CommandEmpty>
                    <CommandGroup>
                      {searchMode === "STUDENT"
                        ? students.map((s) => {
                            const isAlreadyAdded = selectedStudentIds.includes(s.id);
                            return (
                              <CommandItem
                                key={s.id}
                                value={`${s.name}\t${s.rut}\t${s.course?.name ?? ""}`}
                                onSelect={() => void handleAddStudent(s)}
                                className="cursor-pointer py-2.5 px-3 hover:bg-[var(--color-surface-hover)] transition-colors flex items-center justify-between"
                              >
                                <div className="flex flex-col min-w-0 pr-2">
                                  <span className="font-semibold text-white truncate text-sm">
                                    {s.name}
                                  </span>
                                  <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-2">
                                    <span className="font-mono">{s.rut}</span>
                                    <span>·</span>
                                    <span>{s.course?.name}</span>
                                    {s.guardian && <span>· Apod: {s.guardian.name}</span>}
                                  </span>
                                </div>
                                {isAlreadyAdded ? (
                                  <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                                    Añadido
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-[var(--color-text-muted)]">
                                    + Añadir
                                  </span>
                                )}
                              </CommandItem>
                            );
                          })
                        : guardians.map((g) => (
                            <CommandItem
                              key={g.id}
                              value={`${g.name}\t${g.rut ?? ""}`}
                              onSelect={() => void handleSelectGuardian(g)}
                              className="cursor-pointer py-2.5 px-3 hover:bg-[var(--color-surface-hover)] transition-colors flex items-center justify-between"
                            >
                              <div className="flex flex-col min-w-0 pr-2">
                                <span className="font-semibold text-white truncate text-sm">
                                  {g.name}
                                </span>
                                <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-2">
                                  <span className="font-mono">{g.rut ?? "Sin RUT"}</span>
                                  {g.phone && <span>· 📞 {g.phone}</span>}
                                </span>
                              </div>
                              <span className="text-xs font-semibold text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20">
                                {g.students.length} alumno(s)
                              </span>
                            </CommandItem>
                          ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <input type="hidden" {...register("totalAmount", { valueAsNumber: true })} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Columna Principal: Tarjetas de Alumnos y Cuotas */}
          <div className="lg:col-span-7 space-y-6">
            {selectedStudents.length === 0 ? (
              <div className="glass rounded-2xl p-10 border border-dashed border-[var(--color-border)] text-center space-y-4 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto shadow-inner">
                  <Search className="w-8 h-8 opacity-80" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <h3 className="text-lg font-bold text-white">
                    Comienza añadiendo un alumno o apoderado
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    Utiliza la barra de búsqueda superior para seleccionar el alumno a cobrar. Las cuotas pendientes se cargarán de forma automática con su saldo al día.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="px-5 py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold transition-all inline-flex items-center gap-2"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Abrir buscador de alumnos
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Alumnos en esta transacción ({selectedStudents.length})</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="text-xs font-semibold text-blue-300 hover:text-blue-200 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Añadir otro alumno
                  </button>
                </div>

                {selectedStudents.map((student) => (
                  <StudentChargesCard
                    key={student.id}
                    student={student}
                    charges={pendingCharges[student.id] ?? []}
                    concepts={concepts}
                    loadingCharges={loadingCharges[student.id]}
                    allocations={allocations?.filter((a) => a.studentId === student.id) ?? []}
                    onToggleCharge={handleToggleCharge}
                    onAmountChange={handleAmountChange}
                    onAddCustomCredit={handleAddCustomCredit}
                    onSelectAllCharges={handleSelectAllCharges}
                    onSelectOverdueCharges={handleSelectOverdueCharges}
                    onClearCharges={handleClearCharges}
                    onRemoveStudent={handleRemoveStudent}
                    siblingSuggestions={getSiblingSuggestions(student)}
                    onAddSibling={(sibling) => void handleAddStudent(sibling)}
                  />
                ))}

                <FieldError message={errors.allocations?.message as string | undefined} />
              </div>
            )}
          </div>

          {/* Columna Lateral Sticky: Panel de Cobro y Transacción */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-6">
            {/* Tarjeta de Resumen y Total */}
            <div className="glass rounded-2xl p-6 space-y-5 border border-emerald-500/30 shadow-xl bg-gradient-to-b from-emerald-950/20 to-transparent">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5" />
                    Total a Cobrar
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {totalAllocationsCount} cuota(s) · {selectedStudents.length} alumno(s)
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-extrabold font-mono text-emerald-300 tracking-tight">
                    {formatCLP(totalAmountValue)}
                  </span>
                </div>
              </div>

              {/* Selector Rápido de Fecha */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                    Fecha del Pago *
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setValue("paymentDate", getTodayString(), { shouldValidate: true })}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                        paymentDate === getTodayString()
                          ? "bg-blue-600 text-white"
                          : "bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-white"
                      }`}
                    >
                      Hoy
                    </button>
                    <button
                      type="button"
                      onClick={() => setValue("paymentDate", getYesterdayString(), { shouldValidate: true })}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                        paymentDate === getYesterdayString()
                          ? "bg-blue-600 text-white"
                          : "bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-white"
                      }`}
                    >
                      Ayer
                    </button>
                  </div>
                </div>
                <input
                  type="date"
                  {...register("paymentDate")}
                  className={errors.paymentDate ? inputErr : inputOk}
                />
                <FieldError message={errors.paymentDate?.message} />
              </div>

              {/* Selector de Método de Pago y Campos Contextuales */}
              <div className="space-y-2 pt-2 border-t border-[var(--color-border)]/70">
                <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Método de Pago *
                </label>
                <PaymentMethodDetails
                  method={selectedMethod}
                  onChangeMethod={(m) => setValue("method", m, { shouldValidate: true })}
                  totalAmount={totalAmountValue}
                  referenceCode={referenceCode}
                  onChangeReferenceCode={(code) => setValue("referenceCode", code)}
                  notes={notes}
                  onChangeNotes={(n) => setValue("notes", n)}
                />
                <FieldError message={errors.method?.message} />
              </div>
            </div>

            {/* Tarjeta de Boleta / Comprobante */}
            <div className="glass rounded-2xl p-5 space-y-4 border border-[var(--color-border)]">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span>Documento / Boleta</span>
                </h3>
              </div>

              {/* Selector de Modo de Boleta */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => setBoletaMode("EMITTED")}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    boletaMode === "EMITTED"
                      ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 shadow-sm"
                      : "text-[var(--color-text-muted)] hover:text-white"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Boleta Emitida
                </button>
                <button
                  type="button"
                  onClick={() => setBoletaMode("PENDING")}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    boletaMode === "PENDING"
                      ? "bg-amber-500/20 text-amber-200 border border-amber-500/40 shadow-sm"
                      : "text-[var(--color-text-muted)] hover:text-white"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Emitir Después
                </button>
              </div>

              {boletaMode === "PENDING" ? (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-100/90 space-y-1 animate-fade-in">
                  <p className="font-semibold text-amber-200">
                    Bandeja de Boletas Pendientes
                  </p>
                  <p className="text-[11px] text-amber-100/80">
                    El pago se registrará de inmediato y quedará disponible en el historial para adjuntar el N° de boleta del SII posteriormente.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 animate-fade-in">
                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1 uppercase tracking-wider">
                      N° de Boleta SII *
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. BOL-10492"
                      {...register("boletaNumber")}
                      className={errors.boletaNumber ? inputErr : inputOk}
                    />
                    <FieldError message={errors.boletaNumber?.message} />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1 uppercase tracking-wider">
                      PDF de Boleta (Opcional)
                    </label>
                    <div
                      {...getRootProps()}
                      className={`w-full px-3 py-4 rounded-xl bg-[var(--color-bg)] border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                        isDragActive
                          ? "border-blue-500 bg-blue-500/10"
                          : errors.boleta
                            ? "border-red-500/60 text-red-400"
                            : "border-[var(--color-border)] hover:border-blue-400 text-[var(--color-text-muted)]"
                      }`}
                    >
                      <input {...getInputProps()} />
                      {boletaFile ? (
                        <div className="flex items-center justify-between w-full px-2">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <FileText className="w-6 h-6 text-blue-400 shrink-0" />
                            <div className="text-left overflow-hidden">
                              <p className="text-xs font-medium text-white truncate max-w-[180px]">
                                {boletaFile.name}
                              </p>
                              <p className="text-[10px] text-[var(--color-text-muted)]">
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
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <UploadCloud className="w-6 h-6 text-[var(--color-text-muted)]" />
                          <div className="text-center">
                            <p className="text-xs text-white">Arrastra el archivo PDF aquí</p>
                            <p className="text-[10px] text-[var(--color-text-muted)]">Máximo 10MB</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tarjeta de Pagador */}
            <div className="glass rounded-2xl p-5 space-y-4 border border-[var(--color-border)]">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>Datos del Pagador</span>
                </h3>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    {...register("useAltPayer")}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-blue-600 focus:ring-blue-500 bg-[var(--color-bg)]"
                  />
                  <span className="text-xs text-[var(--color-text-secondary)] font-medium">
                    ¿Paga un tercero?
                  </span>
                </label>
              </div>

              {!useAltPayer ? (
                selectedStudents.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Añade un alumno para cargar los datos de contacto del apoderado.
                  </p>
                ) : (
                  <div className="space-y-3 animate-fade-in text-xs">
                    <div>
                      <label className="block font-medium text-[var(--color-text-secondary)] mb-1">
                        Nombre Apoderado *
                      </label>
                      <input
                        type="text"
                        {...register("guardianName")}
                        className={errors.guardianName ? inputErr : inputOk}
                      />
                      <FieldError message={errors.guardianName?.message} />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block font-medium text-[var(--color-text-secondary)]">
                            RUT
                          </label>
                          {initialGuardianState.hasRut ? (
                            <span className="text-[10px] text-blue-300/80 font-mono flex items-center gap-0.5" title="Dato registrado en base de datos">
                              <Lock className="w-2.5 h-2.5" /> Registrado
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-300 font-medium flex items-center gap-0.5" title="Puedes completar el RUT y se guardará al pagar">
                              <Sparkles className="w-2.5 h-2.5" /> Completar
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          readOnly={initialGuardianState.hasRut}
                          placeholder={initialGuardianState.hasRut ? undefined : "12.345.678-9"}
                          {...register("guardianRut")}
                          className={
                            initialGuardianState.hasRut
                              ? inputReadOnly
                              : errors.guardianRut
                                ? inputErr
                                : inputOk
                          }
                        />
                        <FieldError message={errors.guardianRut?.message} />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block font-medium text-[var(--color-text-secondary)]">
                            Teléfono
                          </label>
                          {initialGuardianState.hasPhone ? (
                            <span className="text-[10px] text-blue-300/80 font-mono flex items-center gap-0.5" title="Dato registrado en base de datos">
                              <Lock className="w-2.5 h-2.5" /> Registrado
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber-300 font-medium flex items-center gap-0.5" title="Puedes completar el teléfono y se guardará al pagar">
                              <Sparkles className="w-2.5 h-2.5" /> Completar
                            </span>
                          )}
                        </div>
                        <input
                          type="tel"
                          readOnly={initialGuardianState.hasPhone}
                          placeholder={initialGuardianState.hasPhone ? undefined : "+56 9 1234 5678"}
                          {...register("guardianPhone")}
                          className={
                            initialGuardianState.hasPhone
                              ? inputReadOnly
                              : errors.guardianPhone
                                ? inputErr
                                : inputOk
                          }
                        />
                        <FieldError message={errors.guardianPhone?.message} />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-medium text-[var(--color-text-secondary)]">
                          Correo Electrónico (Notificación)
                        </label>
                        {initialGuardianState.hasEmail ? (
                          <span className="text-[10px] text-blue-300/80 font-mono flex items-center gap-0.5" title="Dato registrado en base de datos">
                            <Lock className="w-2.5 h-2.5" /> Registrado
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-300 font-medium flex items-center gap-0.5" title="Puedes completar el correo y se guardará al pagar">
                            <Sparkles className="w-2.5 h-2.5" /> Completar
                          </span>
                        )}
                      </div>
                      <input
                        type="email"
                        readOnly={initialGuardianState.hasEmail}
                        placeholder={initialGuardianState.hasEmail ? undefined : "apoderado@ejemplo.cl"}
                        {...register("guardianEmail")}
                        className={
                          initialGuardianState.hasEmail
                            ? inputReadOnly
                            : errors.guardianEmail
                              ? inputErr
                              : inputOk
                        }
                      />
                      <FieldError message={errors.guardianEmail?.message} />
                    </div>
                  </div>
                )
              ) : (
                <div className="space-y-3 animate-fade-in text-xs">
                  <div>
                    <label className="block font-medium text-[var(--color-text-secondary)] mb-1">
                      Nombre del Pagador *
                    </label>
                    <input
                      type="text"
                      placeholder="Nombre completo"
                      {...register("payerName")}
                      className={errors.payerName ? inputErr : inputOk}
                    />
                    <FieldError message={errors.payerName?.message} />
                  </div>
                  <div>
                    <label className="block font-medium text-[var(--color-text-secondary)] mb-1">
                      RUT del Pagador
                    </label>
                    <input
                      type="text"
                      placeholder="12.345.678-9"
                      {...register("payerRut")}
                      className={errors.payerRut ? inputErr : inputOk}
                    />
                    <FieldError message={errors.payerRut?.message} />
                  </div>
                </div>
              )}
            </div>

            {/* Tarjeta de Notas y Referencia */}
            <div className="glass rounded-2xl p-5 space-y-3 border border-[var(--color-border)]">
              <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Observaciones / Notas Internas
              </label>
              <input
                type="text"
                placeholder="Notas adicionales sobre este pago (opcional)"
                {...register("notes")}
                className={inputOk}
              />
            </div>

            {/* Botón Principal de Envío */}
            <div className="space-y-2 pt-2">
              <button
                id="submit-payment-btn"
                type="submit"
                disabled={submitting || totalAllocationsCount === 0 || totalAmountValue <= 0}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 text-white font-bold text-base shadow-xl shadow-emerald-600/25 hover:shadow-emerald-600/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none flex items-center justify-center gap-3 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Registrando transacción...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                    <span>
                      {totalAllocationsCount > 0
                        ? `Registrar Pago · ${formatCLP(totalAmountValue)}`
                        : "Seleccione cuotas para cobrar"}
                    </span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between px-2 text-[11px] text-[var(--color-text-muted)]">
                <span>Atajo: <kbd className="font-mono bg-[var(--color-bg)] px-1 rounded border border-[var(--color-border)] text-white">Ctrl+Enter</kbd></span>
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="hover:underline text-[var(--color-text-secondary)]"
                >
                  Cancelar y volver
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Modal de Comprobante Pos-Pago */}
      <PaymentReceiptModal
        open={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        onNewPayment={handleStartNewPayment}
        receiptData={receiptData}
      />
    </div>
  );
}
