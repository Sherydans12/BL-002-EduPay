"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { tenantsApi, type Tenant } from "@/lib/api";
import {
  setActiveTenantId,
  useActiveTenantId,
} from "@/lib/tenant-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

export function TenantSwitcher() {
  const activeTenantId = useActiveTenantId();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadTenants() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await tenantsApi.getAll();
        if (isMounted) setTenants(data);
      } catch {
        if (isMounted) setError("No se pudieron cargar los colegios");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadTenants();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === activeTenantId),
    [activeTenantId, tenants],
  );

  const handleTenantChange = (tenantId: string) => {
    if (!tenantId || tenantId === activeTenantId) return;

    setActiveTenantId(tenantId);
    window.location.reload();
  };

  return (
    <div className="mb-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-100">
        <Building2 className="h-3.5 w-3.5" />
        Contexto colegio
      </div>

      <Select
        value={activeTenantId ?? ""}
        onValueChange={handleTenantChange}
        disabled={isLoading || tenants.length === 0}
      >
        <SelectTrigger className="h-10 w-full border-blue-400/30 bg-[var(--color-bg)] text-left text-white">
          <span className="truncate text-sm">
            {selectedTenant?.name ??
              (isLoading ? "Cargando colegios..." : "Seleccionar colegio")}
          </span>
        </SelectTrigger>
        <SelectContent align="start">
          {tenants.map((tenant) => (
            <SelectItem key={tenant.id} value={tenant.id}>
              {tenant.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error && <p className="mt-2 text-xs text-red-200">{error}</p>}
    </div>
  );
}
