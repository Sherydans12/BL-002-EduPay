"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Info,
  Link2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import {
  ApiRequestError,
  tenantsApi,
  type Tenant,
  type TenantCanonicalMapping,
} from "@/lib/api";
import {
  ASSIGNMENT_TIMEOUT_MS,
  AssignmentTimeoutError,
  newCorrelationId,
  withTimeout,
} from "@/lib/tenant-mapping";
import { NativeSelectField } from "@/components/ui/dropdown-chevron";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_AUDIT_REASON_LENGTH = 500;

type PreflightState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: TenantCanonicalMapping }
  | { status: "already-linked"; result: TenantCanonicalMapping }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string };

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value.trim());
}

function statusClass(status: PreflightState["status"]): string {
  if (status === "ready") return "border-emerald-400/25 bg-emerald-400/10";
  if (status === "already-linked") return "border-blue-400/25 bg-blue-400/10";
  if (status === "conflict" || status === "error") {
    return "border-red-400/25 bg-red-400/10";
  }

  return "border-[var(--color-border)] bg-[var(--color-bg)]/60";
}

function MappingSummary({
  tenant,
  canonicalTenantId,
}: {
  tenant: Tenant;
  canonicalTenantId: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Tenant BL local · recurso objetivo
        </p>
        <p className="mt-3 text-base font-semibold text-white">{tenant.name}</p>
        <p className="mt-1 break-all font-mono text-xs text-[var(--color-text-secondary)]">
          {tenant.id}
        </p>
      </div>
      <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-200/75">
          Tenant canónico · declarado por operador
        </p>
        <p className="mt-3 break-all font-mono text-sm font-semibold text-blue-100">
          {canonicalTenantId || "Aún no ingresado"}
        </p>
        <p className="mt-2 text-xs leading-5 text-blue-100/65">
          Este valor no se infiere desde el nombre, slug, JWT ni datos
          académicos.
        </p>
      </div>
    </div>
  );
}

export default function TenantCanonicalMappingPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [mapping, setMapping] = useState<TenantCanonicalMapping | null>(null);
  const [canonicalTenantId, setCanonicalTenantId] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [identityVerified, setIdentityVerified] = useState(false);
  const [preflight, setPreflight] = useState<PreflightState>({
    status: "idle",
  });
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [loadingMapping, setLoadingMapping] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [correlationId, setCorrelationId] = useState<string | null>(null);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId),
    [selectedTenantId, tenants],
  );

  const auditReason = useMemo(() => {
    if (!reason.trim() || !evidenceReference.trim()) return "";
    return `Motivo: ${reason.trim()} | Evidencia Identity: ${evidenceReference.trim()}`;
  }, [evidenceReference, reason]);

  const canAssign = Boolean(
    selectedTenant &&
    preflight.status === "ready" &&
    identityVerified &&
    reason.trim() &&
    evidenceReference.trim() &&
    auditReason.length <= MAX_AUDIT_REASON_LENGTH,
  );

  useEffect(() => {
    let active = true;

    async function loadTenants() {
      try {
        setLoadingTenants(true);
        setLoadingError(null);
        const result = await tenantsApi.getAll();
        if (!active) return;
        setTenants(result);
        setSelectedTenantId((current) => current || result[0]?.id || "");
      } catch (error: unknown) {
        if (active) {
          setLoadingError(
            getErrorMessage(error, "No se pudieron cargar los tenants BL"),
          );
        }
      } finally {
        if (active) setLoadingTenants(false);
      }
    }

    void loadTenants();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedTenantId) return;

    let active = true;

    async function loadMapping() {
      setLoadingMapping(true);
      setLoadingError(null);
      setActionError(null);
      setTimedOut(false);
      setMapping(null);
      setCanonicalTenantId("");
      setReason("");
      setEvidenceReference("");
      setIdentityVerified(false);
      setPreflight({ status: "idle" });
      setCorrelationId(null);

      try {
        const result = await tenantsApi.getCanonicalMapping(selectedTenantId);
        if (!active) return;
        setMapping(result);
        setCanonicalTenantId(result.canonicalTenantId);
      } catch (error: unknown) {
        if (!active) return;
        if (error instanceof ApiRequestError && error.status === 404) {
          return;
        }
        setLoadingError(
          getErrorMessage(error, "No se pudo consultar el vínculo"),
        );
      } finally {
        if (active) setLoadingMapping(false);
      }
    }

    void loadMapping();
    return () => {
      active = false;
    };
  }, [selectedTenantId]);

  const handleTenantChange = (tenantId: string) => {
    setSelectedTenantId(tenantId);
  };

  const handlePreflight = async () => {
    if (!selectedTenant) return;

    const normalizedCanonicalId = canonicalTenantId.trim().toLowerCase();
    setActionError(null);
    setTimedOut(false);

    if (!isUuidV4(normalizedCanonicalId)) {
      setPreflight({
        status: "error",
        message: "Ingresa un UUID v4 válido de Identity.",
      });
      return;
    }

    setCanonicalTenantId(normalizedCanonicalId);
    setPreflight({ status: "loading" });

    try {
      const result = await tenantsApi.preflightCanonicalMapping(
        selectedTenant.id,
        normalizedCanonicalId,
      );

      if (result.dryRun === true) {
        setPreflight({ status: "ready", result });
      } else {
        setPreflight({ status: "already-linked", result });
      }
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setPreflight({
          status: "conflict",
          message: error.message,
        });
        return;
      }

      setPreflight({
        status: "error",
        message: getErrorMessage(
          error,
          "No se pudo ejecutar el preflight local",
        ),
      });
    }
  };

  const handleOpenConfirmation = () => {
    if (!selectedTenant || preflight.status !== "ready") return;

    if (!identityVerified) {
      setActionError(
        "Debes declarar la verificación manual en el canal administrativo de Identity.",
      );
      return;
    }

    if (!reason.trim() || !evidenceReference.trim()) {
      setActionError(
        "Completa el motivo y la referencia de evidencia antes de confirmar.",
      );
      return;
    }

    if (auditReason.length > MAX_AUDIT_REASON_LENGTH) {
      setActionError(
        "El motivo y la referencia combinados no pueden superar 500 caracteres.",
      );
      return;
    }

    setActionError(null);
    setConfirmOpen(true);
  };

  const handleAssign = async () => {
    if (!selectedTenant || preflight.status !== "ready" || !auditReason) return;

    const stableCorrelationId = correlationId ?? newCorrelationId();
    setCorrelationId(stableCorrelationId);
    setIsSubmitting(true);
    setActionError(null);
    setTimedOut(false);

    try {
      // dryRun does not reserve the pair. Re-run it immediately before the
      // existing immutable write; the write also revalidates server-side.
      const latestPreflight = await tenantsApi.preflightCanonicalMapping(
        selectedTenant.id,
        canonicalTenantId,
      );

      if (latestPreflight.dryRun !== true) {
        setPreflight({ status: "already-linked", result: latestPreflight });
        setConfirmOpen(false);
        return;
      }

      const result = await withTimeout(
        tenantsApi.assignCanonicalMapping(
          selectedTenant.id,
          {
            canonicalTenantId,
            reason: auditReason,
          },
          stableCorrelationId,
        ),
        ASSIGNMENT_TIMEOUT_MS,
      );

      setMapping(result);
      setPreflight({ status: "already-linked", result });
      setConfirmOpen(false);
      setTimedOut(false);
      setCorrelationId(null);
      toast.success(
        result.created === false
          ? "El vínculo ya existía; no se modificó la auditoría original."
          : "Vínculo canónico asignado correctamente.",
      );
    } catch (error: unknown) {
      if (error instanceof AssignmentTimeoutError) {
        setTimedOut(true);
        setActionError(
          "BL no confirmó el resultado. La operación puede haber terminado: reintenta con la misma correlación para resolverla de forma idempotente.",
        );
        setConfirmOpen(false);
      } else if (error instanceof ApiRequestError && error.status === 409) {
        setPreflight({ status: "conflict", message: error.message });
        setConfirmOpen(false);
      } else {
        setActionError(getErrorMessage(error, "No se pudo asignar el vínculo"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const retryAfterTimeout = () => {
    setConfirmOpen(true);
  };

  return (
    <div className="mx-auto max-w-6xl animate-fade-in p-8">
      <div className="mb-8 flex flex-col gap-4 border-b border-[var(--color-border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-100">
            <Link2 className="size-3.5" />
            Contexto de plataforma
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Vinculación de tenants
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
            Revisa y asigna una sola vez la correspondencia entre un tenant
            local BL y su tenant canónico de Identity. Esta operación no inicia
            onboarding ni activa integraciones.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <LockKeyhole className="size-4" />
          Solo SUPER_ADMIN local
        </div>
      </div>

      {loadingError && (
        <div
          className="mb-6 flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            <p>{loadingError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300/30 px-3 py-2 text-xs font-semibold text-red-100 transition-colors hover:bg-red-300/10"
            >
              <RefreshCw className="size-3.5" />
              Reintentar consulta
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div
          className="mb-6 flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            <p>{actionError}</p>
            {timedOut && (
              <button
                type="button"
                onClick={retryAfterTimeout}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-red-300/30 px-3 py-2 text-xs font-semibold text-red-100 transition-colors hover:bg-red-300/10"
              >
                <RefreshCw className="size-3.5" />
                Reintentar la misma asignación
              </button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-6">
        <section className="glass rounded-2xl border border-[var(--color-border)] p-6 shadow-xl">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-xl bg-blue-400/10 p-2.5 text-blue-200">
              <Building2 className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                1. Selecciona el tenant BL
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                La selección identifica el recurso objetivo; no otorga permisos
                adicionales.
              </p>
            </div>
          </div>

          <label
            className="block text-sm font-medium text-[var(--color-text-secondary)]"
            htmlFor="tenant-select"
          >
            Tenant local BL
          </label>
          <NativeSelectField className="mt-2">
            <select
              id="tenant-select"
              value={selectedTenantId}
              onChange={(event) => handleTenantChange(event.target.value)}
              disabled={
                loadingTenants || tenants.length === 0 || loadingMapping
              }
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 pr-10 text-sm text-white outline-none focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {loadingTenants
                  ? "Cargando tenants..."
                  : "Selecciona un tenant"}
              </option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} · {tenant.id}
                </option>
              ))}
            </select>
          </NativeSelectField>

          {selectedTenant && (
            <div className="mt-5">
              {loadingMapping ? (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-4 text-sm text-[var(--color-text-secondary)]">
                  <LoaderCircle className="size-4 animate-spin" />
                  Consultando vínculo actual...
                </div>
              ) : mapping ? (
                <div className="rounded-xl border border-blue-400/25 bg-blue-400/10 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-blue-200" />
                    <div className="min-w-0">
                      <p className="font-semibold text-blue-100">
                        Este tenant ya tiene vínculo
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-blue-100/75">
                        {mapping.canonicalTenantId}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-blue-100/70">
                        La operación 1A es inmutable. No se puede reasignar ni
                        sobrescribir desde esta pantalla.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100">
                  <CircleHelp className="mt-0.5 size-4 shrink-0" />
                  <p>
                    Sin vínculo registrado. Continúa con el preflight local.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="glass rounded-2xl border border-[var(--color-border)] p-6 shadow-xl">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-xl bg-violet-400/10 p-2.5 text-violet-200">
              <Link2 className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                2. Ejecuta el preflight local
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                BL valida UUID, existencia del tenant local, unicidad y
                conflictos. No consulta Identity ni escribe datos.
              </p>
            </div>
          </div>

          <label
            className="block text-sm font-medium text-[var(--color-text-secondary)]"
            htmlFor="canonical-tenant-id"
          >
            canonicalTenantId
          </label>
          <input
            id="canonical-tenant-id"
            value={canonicalTenantId}
            onChange={(event) => {
              setCanonicalTenantId(event.target.value);
              setPreflight({ status: "idle" });
              setIdentityVerified(false);
              setCorrelationId(null);
              setTimedOut(false);
              setActionError(null);
            }}
            disabled={
              !selectedTenant ||
              Boolean(mapping) ||
              preflight.status === "loading"
            }
            placeholder="00000000-0000-4000-8000-000000000000"
            spellCheck={false}
            className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 font-mono text-sm text-white outline-none focus:border-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-[var(--color-text-muted)]">
              La validación es local y no reserva el vínculo. La confirmación
              vuelve a validar.
            </p>
            <button
              type="button"
              onClick={() => void handlePreflight()}
              disabled={
                !selectedTenant ||
                Boolean(mapping) ||
                preflight.status === "loading"
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {preflight.status === "loading" && (
                <LoaderCircle className="size-4 animate-spin" />
              )}
              {preflight.status === "loading"
                ? "Validando..."
                : "Validar localmente"}
            </button>
          </div>

          {preflight.status !== "idle" && preflight.status !== "loading" && (
            <div
              className={`mt-5 rounded-xl border p-4 ${statusClass(preflight.status)}`}
              role="status"
            >
              <div className="flex items-start gap-3">
                {preflight.status === "ready" ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-200" />
                ) : preflight.status === "already-linked" ? (
                  <Info className="mt-0.5 size-5 shrink-0 text-blue-200" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-200" />
                )}
                <div>
                  <p className="font-semibold text-white">
                    {preflight.status === "ready"
                      ? "Validación local aprobada"
                      : preflight.status === "already-linked"
                        ? "El vínculo ya existe"
                        : "Preflight detenido"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
                    {preflight.status === "ready"
                      ? "No se detectaron conflictos locales. Este resultado no comprueba Identity ni reserva el vínculo."
                      : preflight.status === "already-linked"
                        ? "BL encontró el mismo par ya asignado; la auditoría original se conserva."
                        : preflight.message}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {preflight.status === "ready" && selectedTenant && (
          <section className="glass rounded-2xl border border-[var(--color-border)] p-6 shadow-xl">
            <div className="mb-5 flex items-start gap-3">
              <div className="rounded-xl bg-amber-400/10 p-2.5 text-amber-200">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  3. Declara la verificación manual
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Esta declaración queda en el motivo auditable de la
                  asignación. No es una comprobación automática de Identity.
                </p>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300/25 bg-amber-300/10 p-4">
              <input
                type="checkbox"
                checked={identityVerified}
                onChange={(event) => {
                  setIdentityVerified(event.target.checked);
                  setActionError(null);
                }}
                className="mt-1 size-4 rounded border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              <span className="text-sm leading-6 text-amber-50">
                Confirmo que verifiqué manualmente este `canonicalTenantId` y su
                correspondencia con el tenant BL en el canal administrativo de
                Identity.
              </span>
            </label>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <label
                  className="block text-sm font-medium text-[var(--color-text-secondary)]"
                  htmlFor="mapping-reason"
                >
                  Motivo de la asignación
                </label>
                <textarea
                  id="mapping-reason"
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setCorrelationId(null);
                    setTimedOut(false);
                  }}
                  maxLength={350}
                  rows={4}
                  placeholder="Ej.: Alineación inicial del tenant de prueba"
                  className="mt-2 w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--color-primary)]"
                />
                <p className="mt-1 text-right text-xs text-[var(--color-text-muted)]">
                  {reason.length}/350
                </p>
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-[var(--color-text-secondary)]"
                  htmlFor="identity-evidence"
                >
                  Referencia de evidencia
                </label>
                <input
                  id="identity-evidence"
                  value={evidenceReference}
                  onChange={(event) => {
                    setEvidenceReference(event.target.value);
                    setCorrelationId(null);
                    setTimedOut(false);
                  }}
                  maxLength={120}
                  placeholder="Ticket, folio o referencia operativa"
                  className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-white outline-none focus:border-[var(--color-primary)]"
                />
                <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
                  No ingreses tokens, contraseñas, correos ni datos personales
                  innecesarios.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/55 p-4">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 size-4 shrink-0 text-[var(--color-text-muted)]" />
                <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
                  El actor, permisos, fecha y correlación se toman de la sesión
                  autenticada y de BL. El navegador no puede elegir quién queda
                  registrado como operador.
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-[var(--color-border)] pt-6">
              <h3 className="text-sm font-semibold text-white">
                Resumen antes de asignar
              </h3>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Revisa ambas identidades. Identity se verificó manualmente; BL
                validó solo sus condiciones locales.
              </p>
              <div className="mt-4">
                <MappingSummary
                  tenant={selectedTenant}
                  canonicalTenantId={canonicalTenantId}
                />
              </div>
              <button
                type="button"
                onClick={handleOpenConfirmation}
                disabled={!canAssign}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShieldCheck className="size-4" />
                Revisar y confirmar asignación
              </button>
            </div>
          </section>
        )}

        <section className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]/55 p-5">
          <Unplug className="mt-0.5 size-5 shrink-0 text-[var(--color-text-muted)]" />
          <div>
            <p className="text-sm font-semibold text-white">
              Integraciones sin cambios
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
              Asignar este mapping no activa producer, publisher ni shadow y no
              modifica obligaciones, pagos, conciliación ni datos académicos.
            </p>
          </div>
        </section>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => !isSubmitting && setConfirmOpen(open)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <ShieldCheck className="size-5 text-emerald-400" />
              Confirmar vinculación inmutable
            </DialogTitle>
          </DialogHeader>

          {selectedTenant && (
            <div className="space-y-5">
              <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4">
                <p className="text-sm font-semibold text-amber-50">
                  Esta confirmación ejecutará la operación 1A de BL.
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-100/75">
                  El preflight se repetirá ahora. Si la respuesta se demora,
                  podrás reintentar la misma operación con la misma correlación;
                  no se intentará reasignar ni borrar.
                </p>
              </div>

              <MappingSummary
                tenant={selectedTenant}
                canonicalTenantId={canonicalTenantId}
              />

              <div className="grid gap-3 text-xs text-[var(--color-text-secondary)] sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/55 p-3">
                  <p className="font-semibold text-white">Validación local</p>
                  <p className="mt-1 text-emerald-300">
                    Aprobada por dryRun de BL
                  </p>
                </div>
                <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-3">
                  <p className="font-semibold text-white">Identity</p>
                  <p className="mt-1 text-amber-200">
                    Verificación manual declarada
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/55 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Motivo y evidencia que se guardarán
                </p>
                <p className="mt-2 break-words text-sm leading-6 text-[var(--color-text-secondary)]">
                  {auditReason}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6 gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={isSubmitting}
              className="rounded-xl px-4 py-2.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-white disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleAssign()}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Revalidando y asignando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Asignar vínculo
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="mt-6 flex items-center justify-end gap-2 text-xs text-[var(--color-text-muted)]">
        <Clock3 className="size-3.5" />
        La correlación permite recuperar respuestas inciertas sin duplicar la
        asignación.
      </p>
    </div>
  );
}
