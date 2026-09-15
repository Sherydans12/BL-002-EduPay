import { ExecutionContext } from '@nestjs/common';
import { tenantContext } from '../../core/tenant/tenant.context';
import { CanonicalMappingPlatformGuard } from './canonical-mapping-platform.guard';

function executionContext(user?: { id?: unknown; role?: string }) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('CanonicalMappingPlatformGuard', () => {
  const guard = new CanonicalMappingPlatformGuard();

  it('permite SUPER_ADMIN con identidad y contexto de plataforma', () => {
    const result = tenantContext.run(
      { tenantId: null, isSuperAdmin: true },
      () =>
        guard.canActivate(
          executionContext({ id: 'operator-1', role: 'SUPER_ADMIN' }),
        ),
    );

    expect(result).toBe(true);
  });

  it('rechaza roles que no son SUPER_ADMIN', () => {
    expect(() =>
      tenantContext.run({ tenantId: null, isSuperAdmin: false }, () =>
        guard.canActivate(
          executionContext({ id: 'tenant-admin', role: 'TENANT_ADMIN' }),
        ),
      ),
    ).toThrow('Acceso exclusivo para SUPER_ADMIN');
  });

  it('rechaza un tenant seleccionado como contexto de autorización', () => {
    expect(() =>
      tenantContext.run({ tenantId: 'colegio-a', isSuperAdmin: true }, () =>
        guard.canActivate(
          executionContext({ id: 'operator-1', role: 'SUPER_ADMIN' }),
        ),
      ),
    ).toThrow('requiere contexto de plataforma');
  });

  it('falla cerrado si no hay actor autenticado', () => {
    expect(() =>
      tenantContext.run({ tenantId: null, isSuperAdmin: true }, () =>
        guard.canActivate(executionContext({ role: 'SUPER_ADMIN' })),
      ),
    ).toThrow('No se pudo identificar al operador');
  });
});
