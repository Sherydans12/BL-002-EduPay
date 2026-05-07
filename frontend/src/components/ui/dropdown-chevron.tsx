"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const triggerChevronClass =
  "pointer-events-none size-4 shrink-0 text-[var(--color-text-muted)] opacity-90";

/** Ícono para triggers desplegables (Popover + lista, mismo patrón que SelectTrigger). */
export function DropdownChevron({ className }: { className?: string }) {
  return <ChevronDown className={cn(triggerChevronClass, className)} aria-hidden />;
}

/** Quita la flecha nativa del sistema y deja hueco para el ícono superpuesto. */
export const nativeSelectChevronInset = "appearance-none pr-10";

/** Ícono alineado al borde interno derecho del campo (right-3 ≈ mismo aire que px-4 + gap). */
export function NativeSelectChevron({ className }: { className?: string }) {
  return (
    <ChevronDown
      className={cn(
        "pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-text-muted)] opacity-90",
        className
      )}
      aria-hidden
    />
  );
}

/**
 * Envuelve un `<select>` con el mismo chevron que los Popover.
 * Añade `appearance-none` y padding derecho al hijo.
 */
export function NativeSelectField({
  className,
  chevronClassName,
  children,
}: {
  className?: string;
  /** Override para páginas con fondo distinto (ej. dashboard legacy). */
  chevronClassName?: string;
  children: React.ReactElement<{ className?: string }>;
}) {
  return (
    <div className={cn("relative w-full", className)}>
      {React.cloneElement(children, {
        ...children.props,
        className: cn(children.props.className, nativeSelectChevronInset),
      })}
      <NativeSelectChevron className={chevronClassName} />
    </div>
  );
}
