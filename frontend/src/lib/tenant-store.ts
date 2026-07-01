import { useSyncExternalStore } from "react";

const ACTIVE_TENANT_STORAGE_KEY = "edupay.activeTenantId";
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function getActiveTenantId(): string | null {
  if (typeof window === "undefined") return null;

  return window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
}

export function setActiveTenantId(id: string | null): void {
  if (typeof window === "undefined") return;

  if (id) {
    window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, id);
  } else {
    window.localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
  }

  emitChange();
}

export function subscribeToActiveTenant(listener: () => void): () => void {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === ACTIVE_TENANT_STORAGE_KEY) listener();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorage);
  }

  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorage);
    }
  };
}

export function useActiveTenantId(): string | null {
  return useSyncExternalStore(
    subscribeToActiveTenant,
    getActiveTenantId,
    () => null,
  );
}
