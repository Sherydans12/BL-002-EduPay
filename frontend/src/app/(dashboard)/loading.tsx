export default function DashboardLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-6 shadow-xl">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-[var(--color-primary)]" />
        <div className="text-center">
          <p className="text-sm font-medium text-white">Cargando información</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Preparando la vista solicitada...
          </p>
        </div>
      </div>
    </div>
  );
}
