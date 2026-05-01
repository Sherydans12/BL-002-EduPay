"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-2xl border border-red-500/30 bg-[var(--color-surface)] px-8 py-6 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-200">
          !
        </div>
        <h2 className="text-lg font-semibold text-white">Ocurrió un error</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          No pudimos cargar esta sección. Intenta nuevamente en unos segundos.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-xl bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
