"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return <span className="relative inline-flex group/tooltip">{children}</span>
}

function TooltipTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<"span"> & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, props)
  }
  return (
    <span data-slot="tooltip-trigger" className="inline-flex" {...props}>
      {children}
    </span>
  )
}

function TooltipContent({
  className,
  children,
  side = "top",
  ...props
}: React.ComponentProps<"span"> & { side?: "top" | "bottom" }) {
  return (
    <span
      data-slot="tooltip-content"
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-50 max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-xs text-white shadow-lg opacity-0 transition-opacity group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100",
        side === "top" ? "bottom-full left-1/2 -translate-x-1/2 mb-1.5" : "top-full left-1/2 -translate-x-1/2 mt-1.5",
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
