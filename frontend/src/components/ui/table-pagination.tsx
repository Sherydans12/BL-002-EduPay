"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface TablePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPrev: () => void;
  onNext: () => void;
}

export function TablePagination({
  page,
  totalPages,
  total,
  limit,
  onPrev,
  onNext,
}: TablePaginationProps) {
  if (totalPages <= 1 && total <= limit) return null;

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg)]/30">
      <span className="text-sm text-[var(--color-text-muted)]">
        Mostrando{" "}
        <span className="font-medium text-[var(--color-text-secondary)]">
          {from}–{to}
        </span>{" "}
        de{" "}
        <span className="font-medium text-[var(--color-text-secondary)]">
          {total}
        </span>{" "}
        registros &mdash; Página{" "}
        <span className="font-medium text-white">{page}</span> de{" "}
        <span className="font-medium text-white">{totalPages}</span>
      </span>

      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={page <= 1}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          Anterior
        </button>
        <button
          onClick={onNext}
          disabled={page >= totalPages}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          Siguiente
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
