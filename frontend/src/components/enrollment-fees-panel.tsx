"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import {
  academicYearsApi,
  chargesApi,
  conceptsApi,
  type EnrollmentFeeInput,
  type EnrollmentFeePreview,
  type PaymentConcept,
} from "@/lib/api";
import { formatCLP } from "@/lib/currency-utils";

const fieldClass =
  "min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[var(--color-text)]";

export function EnrollmentFeesPanel() {
  const [years, setYears] = useState<
    Awaited<ReturnType<typeof academicYearsApi.getAll>>
  >([]);
  const [concepts, setConcepts] = useState<PaymentConcept[]>([]);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [action, setAction] = useState<"review" | "issue" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{
    input: EnrollmentFeeInput;
    result: EnrollmentFeePreview;
  }>();
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const busy = action !== null;

  useEffect(() => {
    let current = true;
    void Promise.all([academicYearsApi.getAll(), conceptsApi.getAll()])
      .then(([allYears, allConcepts]) => {
        if (!current) return;
        setYears(
          allYears.filter(
            ({ status }) => status === "DRAFT" || status === "ACTIVE",
          ),
        );
        setConcepts(
          allConcepts.filter(
            ({ isActive, name }) =>
              isActive &&
              name
                .normalize("NFD")
                .replace(/\p{Diacritic}/gu, "")
                .toLowerCase()
                .includes("matricula"),
          ),
        );
      })
      .catch(() => {
        if (current)
          setError("No se pudieron cargar los años y conceptos de matrícula.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [retry]);

  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview]);

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      academicYearId: Number(form.get("academicYearId")),
      conceptId: Number(form.get("conceptId")),
      amount: Number(form.get("amount")),
      dueDate: String(form.get("dueDate") ?? ""),
    };
    setAction("review");
    setError("");
    setMessage("");
    setPreview(undefined);
    try {
      const result = await chargesApi.previewEnrollmentFees(input);
      setPreview({ input, result });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No se pudo revisar el cobro.",
      );
    } finally {
      setAction(null);
    }
  }

  async function issue() {
    if (!preview || !preview.result.pendingCount || busy) return;
    setAction("issue");
    setError("");
    try {
      const result = await chargesApi.issueEnrollmentFees({
        ...preview.input,
        fingerprint: preview.result.fingerprint,
      });
      setMessage(
        result.issuedCount
          ? `Se emitieron ${result.issuedCount} cargos de matrícula para ${result.academicYearLabel}. Los apoderados pueden verlos en el portal.`
          : "Los cargos ya estaban emitidos.",
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No se pudo emitir el cobro.",
      );
    } finally {
      setPreview(undefined);
      setAction(null);
    }
  }

  return (
    <section
      aria-labelledby="enrollment-fees-title"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <h2
        id="enrollment-fees-title"
        className="px-5 pt-5 text-base font-semibold text-[var(--color-text)]"
      >
        Emitir matrícula por año
      </h2>
      <div className="space-y-4 px-5 pb-5 pt-2" aria-busy={loading || busy}>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Selecciona el año y revisa el padrón recibido desde Académico antes de
          publicar el cobro.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm text-[var(--color-success)]">
            {message}
          </p>
        )}
        {loading ? (
          <p role="status" className="text-sm">
            Cargando años y conceptos…
          </p>
        ) : null}
        {!loading && (!years.length || !concepts.length) ? (
          <div className="space-y-2">
            {!error ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                {years.length
                  ? "Crea o activa un concepto de matrícula para continuar."
                  : "Aún no hay años disponibles. Prepara primero las matrículas en Académico."}
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError("");
                setLoading(true);
                setRetry((value) => value + 1);
              }}
            >
              Actualizar años y conceptos
            </Button>
          </div>
        ) : null}
        <form
          onSubmit={review}
          onChange={() => {
            setPreview(undefined);
            setMessage("");
          }}
        >
          <fieldset
            disabled={loading || busy}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <label className="block text-sm">
              Año académico
              <NativeSelectField>
                <select
                  required
                  name="academicYearId"
                  defaultValue=""
                  className={fieldClass}
                >
                  <option value="">Selecciona el año</option>
                  {years.map(({ id, label, status }) => (
                    <option key={id} value={id}>
                      {label}
                      {status === "DRAFT" ? " · Borrador" : ""}
                    </option>
                  ))}
                </select>
              </NativeSelectField>
            </label>
            <label className="block text-sm">
              Concepto
              <NativeSelectField>
                <select
                  required
                  name="conceptId"
                  defaultValue=""
                  className={fieldClass}
                  onChange={(event) => {
                    const selected = concepts.find(
                      ({ id }) => id === Number(event.target.value),
                    );
                    setAmount(
                      selected?.defaultAmount
                        ? String(selected.defaultAmount)
                        : "",
                    );
                  }}
                >
                  <option value="">Selecciona la matrícula</option>
                  {concepts.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </NativeSelectField>
            </label>
            <label className="block text-sm">
              Monto por alumno (CLP)
              <input
                required
                type="number"
                name="amount"
                min={50}
                step={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="block text-sm">
              Vencimiento
              <input
                required
                type="date"
                name="dueDate"
                className={fieldClass}
              />
            </label>
          </fieldset>
          <Button
            type="submit"
            variant={preview ? "outline" : "default"}
            disabled={loading || busy || !years.length || !concepts.length}
            className="mt-3 min-h-11"
          >
            {action === "review" ? "Revisando padrón…" : "Revisar emisión"}
          </Button>
        </form>
        {preview && (
          <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
            <div>
              <h3 ref={previewHeading} tabIndex={-1} className="font-semibold">
                {preview.result.conceptName} ·{" "}
                {preview.result.academicYearLabel}
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {formatCLP(preview.input.amount)} por alumno · Vence el{" "}
                {preview.input.dueDate.split("-").reverse().join("-")}
              </p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[var(--color-text-secondary)]">
                  Cargos por emitir
                </dt>
                <dd className="font-semibold tabular-nums">
                  {preview.result.pendingCount}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-secondary)]">
                  Con cargo vigente
                </dt>
                <dd className="font-semibold tabular-nums">
                  {preview.result.existingCount}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-text-secondary)]">
                  Sin apoderado habilitado
                </dt>
                <dd className="font-semibold tabular-nums">
                  {preview.result.withoutGuardianCount}
                </dd>
              </div>
            </dl>
            {preview.result.withoutGuardianCount > 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Revisa los apoderados pendientes en Alumnos. Podrás emitir sus
                cargos después.
              </p>
            ) : null}
            {preview.result.pendingCount > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => void issue()}
                >
                  {action === "issue"
                    ? "Emitiendo…"
                    : `Emitir ${preview.result.pendingCount} ${preview.result.pendingCount === 1 ? "cargo" : "cargos"}`}
                </Button>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {formatCLP(
                    preview.input.amount * preview.result.pendingCount,
                  )}{" "}
                  en total · Se publica al emitir
                </p>
              </div>
            )}
            {preview.result.pendingCount === 0 ? (
              <p
                role="status"
                className="text-sm text-[var(--color-text-secondary)]"
              >
                {preview.result.rosterCount
                  ? "No hay cargos nuevos para emitir con este padrón."
                  : "El año seleccionado aún no tiene matrículas disponibles en Pagos."}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
