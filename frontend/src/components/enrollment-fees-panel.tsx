"use client";

import { useEffect, useState, type FormEvent } from "react";
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
  const [years, setYears] = useState<Awaited<ReturnType<typeof academicYearsApi.getAll>>>([]);
  const [concepts, setConcepts] = useState<PaymentConcept[]>([]);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ input: EnrollmentFeeInput; result: EnrollmentFeePreview }>();

  useEffect(() => {
    let current = true;
    void Promise.all([academicYearsApi.getAll(), conceptsApi.getAll()])
      .then(([allYears, allConcepts]) => {
        if (!current) return;
        setYears(allYears.filter(({ status }) => status === "DRAFT" || status === "ACTIVE"));
        setConcepts(allConcepts.filter(({ isActive, name }) =>
          isActive && name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().includes("matricula")));
      })
      .catch(() => { if (current) setError("No se pudieron cargar los años y conceptos de matrícula."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [retry]);

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      academicYearId: Number(form.get("academicYearId")),
      conceptId: Number(form.get("conceptId")),
      amount: Number(form.get("amount")),
      dueDate: String(form.get("dueDate") ?? ""),
    };
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(undefined);
    try {
      const result = await chargesApi.previewEnrollmentFees(input);
      setPreview({ input, result });
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo revisar el cobro.");
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (!preview || !preview.result.pendingCount || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await chargesApi.issueEnrollmentFees({
        ...preview.input,
        fingerprint: preview.result.fingerprint,
      });
      setMessage(result.issuedCount
        ? `Se emitieron ${result.issuedCount} cargos de matrícula para ${result.academicYearLabel}.`
        : "Los cargos ya estaban emitidos.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo emitir el cobro.");
    } finally {
      setPreview(undefined);
      setBusy(false);
    }
  }

  return (
    <details className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <summary className="cursor-pointer px-5 py-4 font-semibold text-[var(--color-text)]">
        Emitir matrícula por año
      </summary>
      <div className="space-y-4 px-5 pb-5">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Previsualiza el cargo para el padrón recibido desde Académico. Al emitirlo queda disponible en el portal.
        </p>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        {message && <p role="status" className="text-sm text-[var(--color-success)]">{message}</p>}
        {loading ? <p role="status" className="text-sm">Cargando años y conceptos…</p> : null}
        {!loading && (!years.length || !concepts.length) ? (
          <Button type="button" variant="outline" onClick={() => {
            setError("");
            setLoading(true);
            setRetry((value) => value + 1);
          }}>Actualizar años y conceptos</Button>
        ) : null}
        <form onSubmit={review} onChange={() => { setPreview(undefined); setMessage(""); }}>
          <fieldset disabled={loading || busy} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-sm">Año académico
              <NativeSelectField>
                <select required name="academicYearId" defaultValue="" className={fieldClass}>
                  <option value="">Selecciona el año</option>
                  {years.map(({ id, label, status }) => (
                    <option key={id} value={id}>{label}{status === "DRAFT" ? " · Borrador" : ""}</option>
                  ))}
                </select>
              </NativeSelectField>
            </label>
            <label className="block text-sm">Concepto
              <NativeSelectField>
                <select required name="conceptId" defaultValue="" className={fieldClass}
                  onChange={(event) => {
                    const selected = concepts.find(({ id }) => id === Number(event.target.value));
                    setAmount(selected?.defaultAmount ? String(selected.defaultAmount) : "");
                  }}>
                  <option value="">Selecciona la matrícula</option>
                  {concepts.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
              </NativeSelectField>
            </label>
            <label className="block text-sm">Monto por alumno (CLP)
              <input required type="number" name="amount" min={50} step={1} value={amount}
                onChange={(event) => setAmount(event.target.value)} className={fieldClass} />
            </label>
            <label className="block text-sm">Vencimiento
              <input required type="date" name="dueDate" className={fieldClass} />
            </label>
          </fieldset>
          <Button type="submit" variant="outline" disabled={loading || busy || !years.length || !concepts.length} className="mt-3">
            Revisar emisión
          </Button>
        </form>
        {preview && (
          <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
            <p role="status" className="text-sm">
              {preview.result.conceptName} · {preview.result.academicYearLabel} · {formatCLP(preview.input.amount)} por alumno · vence {preview.input.dueDate.split("-").reverse().join("-")}.
              {" "}{preview.result.pendingCount} por emitir, {preview.result.existingCount} con cargo vigente y {preview.result.withoutGuardianCount} sin apoderado habilitado.
            </p>
            {preview.result.pendingCount > 0 && (
              <Button type="button" disabled={busy} onClick={() => void issue()}>
                Emitir {preview.result.pendingCount} cargos
              </Button>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
