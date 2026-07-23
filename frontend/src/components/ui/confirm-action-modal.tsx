"use client";

import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmActionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  variant: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
};

export function ConfirmActionModal({
  open,
  onOpenChange,
  title,
  description,
  variant,
  onConfirm,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  isLoading = false,
}: ConfirmActionModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--color-text-secondary)]">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isLoading}
            className="border-[var(--color-border)] bg-transparent text-white hover:bg-[var(--color-surface-hover)]"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant={variant}
            disabled={isLoading}
            onClick={() => void onConfirm()}
            className={
              variant === "destructive"
                ? "border-0 bg-red-600 text-white hover:bg-red-700"
                : "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
            }
          >
            {isLoading ? "Procesando..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
