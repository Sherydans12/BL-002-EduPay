import { AsyncLocalStorage } from 'node:async_hooks';

export type TenantContextStore = {
  tenantId: string | null;
  isSuperAdmin: boolean;
};

export const tenantContext = new AsyncLocalStorage<TenantContextStore>();
