import {
  BellRing,
  FileText,
  ReceiptText,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type EmailTypesGuideModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type CommunicationGuideItem = {
  type: string;
  title: string;
  trigger: string;
  recipient: string;
  content: string;
  icon: LucideIcon;
  accentClass: string;
};

const emailTypes: CommunicationGuideItem[] = [
  {
    type: "MANUAL_PAYMENT_RECEIPT",
    title: "Comprobante de Pago Manual",
    trigger:
      "Registro manual de pago en caja, transferencia o cheque dentro del panel de EduPay.",
    recipient: "Apoderado asociado al alumno.",
    content:
      "Resumen del pago, monto, cuotas saldadas y comprobante adjunto (si existe).",
    icon: ReceiptText,
    accentClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  {
    type: "BOLETA_EMITTED",
    title: "Emisión de Boleta",
    trigger:
      "Cuando la contadora adjunta el PDF a un pago con boleta pendiente (Webpay o manual).",
    recipient: "Apoderado pagador.",
    content:
      "Notificación formal con la boleta de honorarios o servicios adjunta.",
    icon: FileText,
    accentClass: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  },
  {
    type: "PAYMENT_REMINDER",
    title: "Recordatorio de Cobranza",
    trigger:
      "Envío manual individual o masivo, o automatización de avisos de vencimiento.",
    recipient: "Apoderados con cuotas por vencer o vencidas.",
    content:
      "Detalle de la deuda pendiente y botón de acceso al Portal de Pagos.",
    icon: BellRing,
    accentClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  {
    type: "ACCOUNT_STATEMENT",
    title: "Estado de Cuenta",
    trigger: "Envío del resumen mensual consolidado de deudas.",
    recipient: "Apoderado.",
    content: "Historial financiero completo del año lectivo.",
    icon: ScrollText,
    accentClass: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
];

export function EmailTypesGuideModal({
  open,
  onOpenChange,
}: EmailTypesGuideModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            Guía de Tipos de Comunicaciones
          </DialogTitle>
          <DialogDescription className="text-[var(--color-text-secondary)]">
            Conoce cuándo se envía cada correo y la información que recibe el
            apoderado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 pt-2 sm:grid-cols-2">
          {emailTypes.map((emailType) => {
            const Icon = emailType.icon;

            return (
              <article
                key={emailType.type}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]/70 p-5"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl border ${emailType.accentClass}`}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-white">
                      {emailType.title}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-[var(--color-text-muted)]">
                      {emailType.type}
                    </p>
                  </div>
                </div>

                <dl className="mt-5 space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Disparador
                    </dt>
                    <dd className="mt-1 leading-5 text-[var(--color-text-secondary)]">
                      {emailType.trigger}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Destinatario
                    </dt>
                    <dd className="mt-1 leading-5 text-[var(--color-text-secondary)]">
                      {emailType.recipient}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Contenido
                    </dt>
                    <dd className="mt-1 leading-5 text-[var(--color-text-secondary)]">
                      {emailType.content}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
