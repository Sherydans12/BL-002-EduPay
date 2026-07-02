"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { usersApi } from "@/lib/api";

type SessionUser = {
  email?: string;
  name?: string;
  role?: string;
};

type PasswordState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const initialForm: PasswordState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export default function MiCuentaPage() {
  const [form, setForm] = useState<PasswordState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const sessionUser = useMemo(() => getSessionUser(), []);

  const checks = useMemo(
    () => [
      {
        label: "8 caracteres mínimo",
        valid: form.newPassword.length >= 8,
      },
      {
        label: "Una mayúscula",
        valid: /[A-Z]/.test(form.newPassword),
      },
      {
        label: "Una minúscula",
        valid: /[a-z]/.test(form.newPassword),
      },
      {
        label: "Un número",
        valid: /[0-9]/.test(form.newPassword),
      },
      {
        label: "Confirmación coincide",
        valid:
          form.confirmPassword.length > 0 &&
          form.newPassword === form.confirmPassword,
      },
    ],
    [form.confirmPassword, form.newPassword],
  );

  const passwordIsReady = checks.every((check) => check.valid);
  const canSubmit =
    form.currentPassword.length > 0 &&
    form.newPassword.length > 0 &&
    form.confirmPassword.length > 0 &&
    passwordIsReady &&
    !submitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!passwordIsReady) {
      toast.error("Revisa los requisitos de la nueva contraseña");
      return;
    }

    setSubmitting(true);
    try {
      const response = await usersApi.changePassword(form);
      setForm(initialForm);
      toast.success(response.message || "Contraseña actualizada correctamente");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la contraseña",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl animate-fade-in">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-blue-300">Mi Cuenta</p>
          <h1 className="text-3xl font-bold text-white">Seguridad de acceso</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
            Mantén tus credenciales actualizadas para proteger la información
            financiera y administrativa de la plataforma.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.4fr]">
        <section className="glass rounded-xl p-6 shadow-xl">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-white">Datos de sesión</h2>
          <div className="mt-5 space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Nombre
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-white">
                {sessionUser?.name || "Usuario"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Correo
              </p>
              <p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">
                {sessionUser?.email || "No disponible"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Rol
              </p>
              <span className="mt-2 inline-flex rounded-lg bg-blue-500/15 px-2.5 py-1 text-xs font-semibold text-blue-300">
                {sessionUser?.role || "Sin rol"}
              </span>
            </div>
          </div>
        </section>

        <section className="glass rounded-xl p-6 shadow-xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Cambiar contraseña
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Se solicitará tu contraseña actual antes de guardar el cambio.
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <LockKeyhole className="h-5 w-5" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <PasswordInput
              id="currentPassword"
              label="Contraseña actual"
              value={form.currentPassword}
              autoComplete="current-password"
              show={showPasswords}
              onChange={(value) =>
                setForm((current) => ({ ...current, currentPassword: value }))
              }
            />

            <div className="grid gap-4 md:grid-cols-2">
              <PasswordInput
                id="newPassword"
                label="Nueva contraseña"
                value={form.newPassword}
                autoComplete="new-password"
                show={showPasswords}
                onChange={(value) =>
                  setForm((current) => ({ ...current, newPassword: value }))
                }
              />
              <PasswordInput
                id="confirmPassword"
                label="Confirmar contraseña"
                value={form.confirmPassword}
                autoComplete="new-password"
                show={showPasswords}
                onChange={(value) =>
                  setForm((current) => ({ ...current, confirmPassword: value }))
                }
              />
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-white">
                  Requisitos de seguridad
                </p>
                <button
                  type="button"
                  onClick={() => setShowPasswords((current) => !current)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-white"
                  aria-label={
                    showPasswords
                      ? "Ocultar contraseñas"
                      : "Mostrar contraseñas"
                  }
                  title={
                    showPasswords
                      ? "Ocultar contraseñas"
                      : "Mostrar contraseñas"
                  }
                >
                  {showPasswords ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {checks.map((check) => (
                  <div
                    key={check.label}
                    className={`flex items-center gap-2 text-sm ${
                      check.valid
                        ? "text-emerald-300"
                        : "text-[var(--color-text-muted)]"
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{check.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/25 transition-all hover:bg-emerald-500 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                {submitting ? "Guardando..." : "Actualizar contraseña"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  label,
  value,
  autoComplete,
  show,
  onChange,
}: {
  id: keyof PasswordState;
  label: string;
  value: string;
  autoComplete: string;
  show: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
      >
        {label}
      </label>
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required
        className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-white outline-none transition-all focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
      />
    </div>
  );
}

function getSessionUser(): SessionUser | null {
  if (typeof document === "undefined") return null;

  const token = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("auth_token="))
    ?.split("=")[1];

  if (!token) return null;

  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

    return JSON.parse(new TextDecoder().decode(bytes)) as SessionUser;
  } catch {
    return null;
  }
}
