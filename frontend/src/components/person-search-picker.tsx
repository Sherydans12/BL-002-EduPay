"use client";

import { useState, type ReactNode } from "react";

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DropdownChevron } from "@/components/ui/dropdown-chevron";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { PersonSearchResult } from "@/lib/person-search";
import { personSearchStatusText } from "@/lib/person-search";
import { usePersonSearch } from "@/lib/use-person-search";

export type PersonSearchPickerProps<T extends { id: number }> = {
  /** id del botón disparador, para asociarlo con su `<label htmlFor>`. */
  id: string;
  /** Texto del botón cuando hay una persona elegida; null si no hay. */
  selectedLabel: string | null;
  placeholder: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  search: (query: string) => Promise<PersonSearchResult<T>>;
  /** Vuelve a consultar cuando cambia un filtro externo (p. ej. curso). */
  scopeKey?: string;
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  /** Si se entrega, agrega una opción para quitar la selección. */
  clearLabel?: string;
  onClear?: () => void;
  /** Mantener abierto tras elegir (selección múltiple). */
  keepOpenOnSelect?: boolean;
  disabled?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
};

/**
 * Selector de personas que busca en el servidor (nombre o RUT) con resultados
 * acotados. Reemplaza las listas que cargaban el padrón completo en el DOM.
 */
export function PersonSearchPicker<T extends { id: number }>({
  id,
  selectedLabel,
  placeholder,
  searchPlaceholder,
  searchAriaLabel,
  search,
  scopeKey,
  renderItem,
  onSelect,
  clearLabel,
  onClear,
  keepOpenOnSelect = false,
  disabled = false,
  triggerClassName,
  contentClassName,
}: PersonSearchPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const result = usePersonSearch(text, search, {
    enabled: open,
    ...(scopeKey !== undefined ? { scopeKey } : {}),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={
            triggerClassName ??
            "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-left text-sm text-white outline-none focus:border-[var(--color-primary)] flex items-center gap-2 disabled:opacity-60"
          }
        >
          <span
            className={`min-w-0 flex-1 truncate ${selectedLabel ? "text-white" : "text-[var(--color-text-muted)]"}`}
          >
            {selectedLabel ?? placeholder}
          </span>
          <DropdownChevron />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={
          contentClassName ?? "w-[min(420px,calc(100vw-2rem))] p-0 z-[60]"
        }
        align="start"
      >
        <Command shouldFilter={false} className="bg-transparent">
          <CommandInput
            aria-label={searchAriaLabel}
            placeholder={searchPlaceholder}
            value={text}
            onValueChange={setText}
          />
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-[var(--color-text-muted)]"
          >
            <span>
              {personSearchStatusText({
                query: result.query,
                loading: result.loading,
                error: result.error,
                shown: result.items.length,
                total: result.total,
              })}
            </span>
            {result.error ? (
              <button
                type="button"
                onClick={result.retry}
                className="shrink-0 rounded-md border border-[var(--color-border)] px-2 py-1 text-white hover:bg-[var(--color-surface-hover)]"
              >
                Reintentar
              </button>
            ) : null}
          </div>
          <CommandList className="max-h-64">
            <CommandGroup>
              {clearLabel && onClear ? (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onClear();
                    setText("");
                    setOpen(false);
                  }}
                  className="cursor-pointer text-[var(--color-text-secondary)]"
                >
                  {clearLabel}
                </CommandItem>
              ) : null}
              {result.items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`person-${item.id}`}
                  onSelect={() => {
                    onSelect(item);
                    if (!keepOpenOnSelect) {
                      setText("");
                      setOpen(false);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {renderItem(item)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
