"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Mail, Save } from "lucide-react";
import { toast } from "sonner";
import {
  communicationsApi,
  type TenantEmailConfig,
  type UpdateTenantEmailConfigInput,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type EmailSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (settings: TenantEmailConfig) => void;
};

type EmailSettingsForm = Omit<
  UpdateTenantEmailConfigInput,
  "replyToEmail" | "emailFooter"
> & {
  replyToEmail: string;
  emailFooter: string;
};

const defaultSettings: EmailSettingsForm = {
  senderName: "Colegio Conquistadores",
  replyToEmail: "",
  emailFooter: "",
  enableManualPaymentEmails: true,
  enableBoletaEmails: true,
  enableReminderEmails: true,
};

function toFormSettings(settings: TenantEmailConfig): EmailSettingsForm {
  return {
    senderName: settings.senderName,
    replyToEmail: settings.replyToEmail ?? "",
    emailFooter: settings.emailFooter ?? "",
    enableManualPaymentEmails: settings.enableManualPaymentEmails,
    enableBoletaEmails: settings.enableBoletaEmails,
    enableReminderEmails: settings.enableReminderEmails,
  };
}

type EmailToggleProps = {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

function EmailToggle({
  label,
  description,
  checked,
  onCheckedChange,
}: EmailToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 focus:ring-offset-[var(--color-surface)] ${
          checked ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"
        }`}
      >
        <span
          className={`inline-block size-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function EmailSettingsModal({
  open,
  onOpenChange,
  onSaved,
}: EmailSettingsModalProps) {
  const [settings, setSettings] = useState<EmailSettingsForm>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);

    void communicationsApi
      .getSettings()
      .then((config) => {
        if (!cancelled) setSettings(toFormSettings(config));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error
              ? error.message
              : "No fue posible cargar la configuración de envíos",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const updateField = <K extends keyof EmailSettingsForm>(
    field: K,
    value: EmailSettingsForm[K],
  ) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const saved = await communicationsApi.updateSettings({
        ...settings,
        senderName: settings.senderName.trim(),
        replyToEmail: settings.replyToEmail.trim() || null,
        emailFooter: settings.emailFooter.trim() || null,
      });
      setSettings(toFormSettings(saved));
      toast.success("Configuración de envíos guardada");
      onSaved?.(saved);
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible guardar la configuración de envíos",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-white">
            <Mail className="size-5 text-[var(--color-primary)]" />
            Configuración de Envíos
          </DialogTitle>
          <DialogDescription className="text-[var(--color-text-secondary)]">
            Personaliza la identidad y las automatizaciones de correo para este
            colegio.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoaderCircle className="size-7 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            <section className="space-y-4">
              <div>
                <h3 className="font-semibold text-white">Identidad</h3>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Esta información se aplicará a los próximos correos enviados.
                </p>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  Nombre del remitente
                </span>
                <Input
                  value={settings.senderName}
                  onChange={(event) =>
                    updateField("senderName", event.target.value)
                  }
                  maxLength={120}
                  className="border-[var(--color-border)] bg-[var(--color-bg)] text-white"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  Correo de respuesta
                </span>
                <Input
                  type="email"
                  value={settings.replyToEmail}
                  onChange={(event) =>
                    updateField("replyToEmail", event.target.value)
                  }
                  placeholder="administracion@colegio.cl"
                  className="border-[var(--color-border)] bg-[var(--color-bg)] text-white"
                />
              </label>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="font-semibold text-white">
                  Firma / Pie de Página
                </h3>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Puedes incluir texto o HTML simple para la firma
                  institucional.
                </p>
              </div>
              <Textarea
                value={settings.emailFooter}
                onChange={(event) =>
                  updateField("emailFooter", event.target.value)
                }
                placeholder="Equipo de Administración&#10;Colegio Conquistadores"
                rows={4}
                className="border-[var(--color-border)] bg-[var(--color-bg)] text-white"
              />
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="font-semibold text-white">Automatizaciones</h3>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Al desactivar una opción, EduPay omite el envío sin consumir
                  créditos de Resend.
                </p>
              </div>
              <EmailToggle
                label="Comprobante de pago manual"
                description="Enviar comprobante al registrar un pago manual."
                checked={settings.enableManualPaymentEmails}
                onCheckedChange={(checked) =>
                  updateField("enableManualPaymentEmails", checked)
                }
              />
              <EmailToggle
                label="Notificación de boleta"
                description="Enviar aviso al adjuntar la boleta de un pago."
                checked={settings.enableBoletaEmails}
                onCheckedChange={(checked) =>
                  updateField("enableBoletaEmails", checked)
                }
              />
              <EmailToggle
                label="Recordatorios de cobranza"
                description="Permitir el envío de recordatorios de cuotas pendientes."
                checked={settings.enableReminderEmails}
                onCheckedChange={(checked) =>
                  updateField("enableReminderEmails", checked)
                }
              />
            </section>
          </div>
        )}

        <DialogFooter className="mt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={saveSettings}
            disabled={loading || saving || !settings.senderName.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar Cambios
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
