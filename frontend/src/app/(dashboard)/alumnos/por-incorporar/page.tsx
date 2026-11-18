"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  GraduationCap,
  Link2,
  Loader2,
  RefreshCw,
  UserPlus,
} from "lucide-react";

import {
  academicIntakeApi,
  type AcademicIntakeAcceptInput,
  type AcademicIntakeItem,
  type Guardian,
} from "@/lib/api";
import {
  intakeCanCreate,
  intakeLoadErrorMessage,
  intakeNationalIdLabel,
  intakeYearLabel,
} from "@/lib/academic-intake";
import { searchGuardians } from "@/lib/person-search";
import { PersonSearchPicker } from "@/components/person-search-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: AcademicIntakeItem[] };

function fullName(item: AcademicIntakeItem) {
  return `${item.firstName} ${item.lastName}`.trim();
}

/**
 * Alumnos que llegaron desde Académico y aún no tienen ficha en Pagos
 * (ADR-0027). Pagos es dueño de los apoderados: la ficha y su matrícula se
 * crean al asignar uno, o al confirmar un alumno existente con el mismo RUN.
 */
export default function AcademicIntakePage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = useState<AcademicIntakeItem | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", items: await academicIntakeApi.list() });
    } catch (error) {
      setState({ status: "error", message: intakeLoadErrorMessage(error) });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const onIncorporated = (academicStudentId: string) => {
    setSelected(null);
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            items: current.items.filter(
              (item) => item.academicStudentId !== academicStudentId,
            ),
          }
        : current,
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/alumnos"
            className="mb-2 inline-flex items-center text-sm text-[var(--color-text-muted)] transition-colors hover:text-white"
          >
            <ArrowLeft className="mr-1 size-4" />
            Volver a Alumnos
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Nuevos desde Académico
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-secondary)]">
            Alumnos matriculados en Académico que aún no tienen ficha en Pagos.
            Asigna su apoderado para crear la ficha y su matrícula del año; el
            plan de cobro se configura después en Setup Financiero.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={state.status === "loading"}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
        >
          <RefreshCw
            className={`size-4 ${state.status === "loading" ? "animate-spin" : ""}`}
          />
          Actualizar
        </button>
      </div>

      {state.status === "loading" ? (
        <div
          role="status"
          className="glass rounded-2xl p-12 text-center text-[var(--color-text-muted)]"
        >
          <Loader2 className="mx-auto mb-3 size-8 animate-spin opacity-60" />
          Cargando alumnos por incorporar…
        </div>
      ) : state.status === "error" ? (
        <div
          role="alert"
          className="glass flex flex-col items-start gap-3 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3 text-sm text-[var(--color-text)]">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-[var(--color-danger)]" />
            <span>{state.message}</span>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-surface-hover)]"
          >
            <RefreshCw className="size-4" />
            Reintentar
          </button>
        </div>
      ) : state.items.length === 0 ? (
        <div className="glass space-y-3 rounded-2xl p-12 text-center">
          <CheckCircle2 className="mx-auto size-10 text-[var(--color-success)]" />
          <h2 className="text-xl font-semibold text-white">
            No hay alumnos por incorporar
          </h2>
          <p className="mx-auto max-w-md text-sm text-[var(--color-text-secondary)]">
            Cuando Académico matricule a un alumno que no existe en Pagos,
            aparecerá aquí para asignarle su apoderado.
          </p>
        </div>
      ) : (
        <section
          aria-labelledby="intake-list-title"
          className="glass overflow-hidden rounded-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-6 py-4">
            <h2 id="intake-list-title" className="font-semibold text-white">
              Por incorporar
            </h2>
            <span className="rounded-full bg-[var(--color-primary-light)] px-3 py-1 text-xs font-semibold text-white">
              {state.items.length}{" "}
              {state.items.length === 1 ? "alumno" : "alumnos"}
            </span>
          </div>
          <ul className="divide-y divide-[var(--color-border)]">
            {state.items.map((item) => (
              <li
                key={item.academicStudentId}
                className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-[var(--color-surface-hover)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-semibold text-white">
                    {fullName(item)}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-text-secondary)]">
                    <span>{intakeNationalIdLabel(item)}</span>
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="size-4 text-[var(--color-text-muted)]" />
                      {item.courseLabel} · {intakeYearLabel(item)}
                    </span>
                  </p>
                  {item.possibleMatch ? (
                    <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-warning)]">
                      <Link2 className="size-3.5" />
                      Ya hay un alumno con este RUN en Pagos: revisa antes de
                      crear otra ficha.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)]"
                  aria-label={`Incorporar a ${fullName(item)}`}
                >
                  <UserPlus className="size-4" />
                  Incorporar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected ? (
        <IncorporateDialog
          item={selected}
          onClose={() => setSelected(null)}
          onIncorporated={onIncorporated}
        />
      ) : null}
    </div>
  );
}

function IncorporateDialog({
  item,
  onClose,
  onIncorporated,
}: {
  item: AcademicIntakeItem;
  onClose: () => void;
  onIncorporated: (academicStudentId: string) => void;
}) {
  const [guardian, setGuardian] = useState<Pick<Guardian, "id" | "name"> | null>(
    null,
  );
  const [saving, setSaving] = useState<"create" | "link" | null>(null);
  const [error, setError] = useState("");

  const submit = async (input: AcademicIntakeAcceptInput, mode: "create" | "link") => {
    setSaving(mode);
    setError("");
    try {
      await academicIntakeApi.accept(item.academicStudentId, input);
      toast.success(
        mode === "link"
          ? `${fullName(item)} quedó vinculado a su ficha de Pagos.`
          : `Se creó la ficha de ${fullName(item)} con su matrícula ${item.academicYearLabel}.`,
      );
      onIncorporated(item.academicStudentId);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "No se pudo incorporar al alumno.",
      );
    } finally {
      setSaving(null);
    }
  };

  const canCreate = intakeCanCreate(item);

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Incorporar a {fullName(item)}
          </DialogTitle>
          <DialogDescription>
            {intakeNationalIdLabel(item)} · {item.courseLabel} ·{" "}
            {intakeYearLabel(item)}. Los datos del alumno vienen de Académico y
            se editan allí.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {item.possibleMatch ? (
            <div className="space-y-3 rounded-xl border border-amber-400/35 bg-amber-400/10 p-4 text-sm text-amber-100">
              <p>
                En Pagos ya existe <strong>{item.possibleMatch.name}</strong> (
                {item.possibleMatch.courseName}) con el mismo RUN. Si es la
                misma persona, vincula esa ficha para conservar su historial y
                apoderado.
              </p>
              <button
                type="button"
                disabled={saving !== null}
                onClick={() =>
                  void submit(
                    { existingStudentId: item.possibleMatch!.studentId },
                    "link",
                  )
                }
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300/50 px-4 py-2 font-semibold text-amber-50 hover:bg-amber-400/15 disabled:opacity-50"
              >
                {saving === "link" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Link2 className="size-4" />
                )}
                Vincular con esta ficha
              </button>
            </div>
          ) : null}

          {canCreate ? (
            <div className="space-y-2">
              <label
                htmlFor="intake-guardian"
                className="block text-sm font-medium text-[var(--color-text-secondary)]"
              >
                {item.possibleMatch ? "O crea una ficha nueva con su apoderado" : "Apoderado *"}
              </label>
              <PersonSearchPicker
                id="intake-guardian"
                selectedLabel={guardian?.name ?? null}
                placeholder="Seleccionar apoderado..."
                searchPlaceholder="Buscar apoderado por nombre o RUT..."
                searchAriaLabel="Buscar apoderado por nombre o RUT"
                search={searchGuardians}
                triggerClassName="w-full px-4 py-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-left text-white focus:border-[var(--color-primary)] outline-none flex items-center gap-2"
                contentClassName="w-[min(450px,calc(100vw-2rem))] p-0 z-[60]"
                renderItem={(g) => (
                  <div className="flex flex-col">
                    <span>{g.name}</span>
                    {g.rut ? (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {g.rut}
                      </span>
                    ) : null}
                  </div>
                )}
                onSelect={(g) => setGuardian({ id: g.id, name: g.name })}
              />
              <p className="text-xs text-[var(--color-text-muted)]">
                ¿No está registrado?{" "}
                <Link
                  href="/apoderados"
                  target="_blank"
                  className="font-medium text-[var(--color-primary)] underline-offset-2 hover:underline"
                >
                  Créalo en Apoderados
                </Link>{" "}
                (se abre en otra pestaña) y vuelve a buscarlo.
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-[var(--color-border)] p-4 text-sm text-[var(--color-text-secondary)]">
              Este alumno no tiene RUN ni IPE en Académico. Regístralo allí
              para poder crear su ficha en Pagos.
            </p>
          )}

          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving !== null}
              className="min-h-11 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            >
              Cancelar
            </button>
            {canCreate ? (
              <button
                type="button"
                disabled={!guardian || saving !== null}
                onClick={() =>
                  guardian && void submit({ guardianId: guardian.id }, "create")
                }
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                {saving === "create" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                Crear ficha y matrícula
              </button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
