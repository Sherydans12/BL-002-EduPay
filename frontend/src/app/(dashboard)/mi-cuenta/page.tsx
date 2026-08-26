"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  User,
  ShieldCheck,
  LockKeyhole,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  Building2,
  Mail,
  ShieldAlert,
  LogOut,
  Sparkles,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { usersApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type SessionUser = {
  email?: string;
  name?: string;
  role?: string;
  tenantSlug?: string;
  tenantName?: string;
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

const ROLE_DESCRIPTIONS: Record<string, { label: string; desc: string; color: string }> = {
  ADMIN: {
    label: "Administrador General",
    desc: "Acceso total a tesorería, configuración institucional, cobranzas y gestión de usuarios.",
    color: "border-purple-500/30 bg-purple-500/15 text-purple-300",
  },
  FINANCE: {
    label: "Tesorero / Finanzas",
    desc: "Gestión de pagos, emisión de recibos, configuración de planes y sábanas de cuotas.",
    color: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  },
  VIEWER: {
    label: "Consultor / Auditor",
    desc: "Lectura y supervisión de reportes, alumnos y estados de cuenta.",
    color: "border-blue-500/30 bg-blue-500/15 text-blue-300",
  },
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
        label: "Una mayúscula (A-Z)",
        valid: /[A-Z]/.test(form.newPassword),
      },
      {
        label: "Una minúscula (a-z)",
        valid: /[a-z]/.test(form.newPassword),
      },
      {
        label: "Un número (0-9)",
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
      toast.success(response.message || "Contraseña actualizada exitosamente");
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

  const handleLogout = () => {
    document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/login";
  };

  const userInitials = useMemo(() => {
    if (!sessionUser?.name) return "U";
    return sessionUser.name
      .split(" ")
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }, [sessionUser]);

  const roleInfo =
    ROLE_DESCRIPTIONS[sessionUser?.role ?? "ADMIN"] ?? {
      label: sessionUser?.role ?? "Usuario",
      desc: "Acceso estándar a la plataforma escolar.",
      color: "border-blue-500/30 bg-blue-500/15 text-blue-300",
    };

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-14 animate-fade-in">
      {/* Header Superior */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
              <User className="size-5" />
            </span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Mi Cuenta & Seguridad
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Información de perfil, credenciales de acceso y permisos del sistema
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleLogout}
          className="gap-2 text-xs border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
        >
          <LogOut className="size-3.5" />
          Cerrar Sesión
        </Button>
      </div>

      {/* Grid Principal de 2 Columnas */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Columna Izquierda: Perfil y Rol (5 Columnas) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Card de Perfil */}
          <div className="glass rounded-3xl border border-[var(--color-border)] p-6 shadow-xl space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 font-bold text-white text-xl shadow-lg shadow-blue-600/30">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-white truncate">
                  {sessionUser?.name || "Usuario del Sistema"}
                </h2>
                <p className="text-xs text-[var(--color-text-secondary)] truncate">
                  {sessionUser?.email || "usuario@colegio.cl"}
                </p>
                <div className="mt-2">
                  <Badge className={roleInfo.color}>
                    {roleInfo.label}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t border-[var(--color-border)] pt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">Estado de la cuenta:</span>
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" /> Activa
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">Entorno escolar:</span>
                <span className="font-semibold text-white">
                  {sessionUser?.tenantName || sessionUser?.tenantSlug || "Colegio Activo"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-text-muted)]">Autenticación:</span>
                <span className="font-semibold text-blue-300">
                  JWT Seguro + Cookies HttpOnly
                </span>
              </div>
            </div>
          </div>

          {/* Card de Permisos y Rol */}
          <div className="glass rounded-3xl border border-[var(--color-border)] p-6 shadow-xl space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-purple-400" />
              <h3 className="text-sm font-bold text-white">
                Permisos Asignados
              </h3>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
              {roleInfo.desc}
            </p>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1.5 text-[11px] font-medium text-purple-300">
                <Sparkles className="size-3" />
                Acceso autorizado por la administración escolar
              </span>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Seguridad y Cambio de Contraseña (7 Columnas) */}
        <div className="lg:col-span-7">
          <div className="glass rounded-3xl border border-[var(--color-border)] p-6 md:p-8 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <KeyRound className="size-5 text-emerald-400" />
                  <span>Actualizar Contraseña</span>
                </h2>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  Establece una nueva clave segura para tu cuenta
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPasswords((curr) => !curr)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-white transition-colors"
              >
                {showPasswords ? (
                  <>
                    <EyeOff className="size-3.5" />
                    <span>Ocultar</span>
                  </>
                ) : (
                  <>
                    <Eye className="size-3.5" />
                    <span>Ver</span>
                  </>
                )}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                  Contraseña Actual *
                </label>
                <input
                  type={showPasswords ? "text" : "password"}
                  value={form.currentPassword}
                  onChange={(e) =>
                    setForm((curr) => ({ ...curr, currentPassword: e.target.value }))
                  }
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  required
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                    Nueva Contraseña *
                  </label>
                  <input
                    type={showPasswords ? "text" : "password"}
                    value={form.newPassword}
                    onChange={(e) =>
                      setForm((curr) => ({ ...curr, newPassword: e.target.value }))
                    }
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    required
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
                    Confirmar Contraseña *
                  </label>
                  <input
                    type={showPasswords ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(e) =>
                      setForm((curr) => ({ ...curr, confirmPassword: e.target.value }))
                    }
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    required
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-xs text-white focus:border-[var(--color-primary)] outline-none"
                  />
                </div>
              </div>

              {/* Checklist Interactivo de Seguridad */}
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-4 space-y-2">
                <p className="text-xs font-bold text-white">
                  Requisitos de Seguridad:
                </p>
                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  {checks.map((check) => (
                    <div
                      key={check.label}
                      className={`flex items-center gap-1.5 transition-colors ${
                        check.valid
                          ? "text-emerald-400 font-medium"
                          : "text-[var(--color-text-muted)]"
                      }`}
                    >
                      <CheckCircle2
                        className={`size-3.5 shrink-0 ${
                          check.valid ? "text-emerald-400" : "text-gray-600"
                        }`}
                      />
                      <span>{check.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="gap-2 text-xs bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-700/25 font-semibold"
                >
                  {submitting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  {submitting ? "Actualizando..." : "Guardar Nueva Contraseña"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
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
