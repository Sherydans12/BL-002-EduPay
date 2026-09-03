import { tenantContext } from '../core/tenant/tenant.context';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from './tenants.service';

const canonicalTenantId = '11111111-1111-4111-8111-111111111111';

function mapping(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'colegio-a',
    canonicalTenantId,
    assignedByUserId: 'operator-1',
    correlationId: 'correlation-1',
    reason: 'Alineación inicial en ambiente de pruebas',
    createdAt: new Date('2026-09-03T00:00:00.000Z'),
    ...overrides,
  };
}

describe('TenantsService', () => {
  it('lista tenants fuera del scope seleccionado por el SUPER_ADMIN', async () => {
    let lookupContext: ReturnType<typeof tenantContext.getStore>;
    const prisma = {
      tenant: {
        findMany: jest.fn().mockImplementation(() => {
          lookupContext = tenantContext.getStore();
          return [{ id: 'colegio-pruebas', name: 'Colegio Pruebas' }];
        }),
      },
    };
    const service = new TenantsService(prisma as unknown as PrismaService);

    const tenants = await tenantContext.run(
      { tenantId: 'colegio-pruebas', isSuperAdmin: true },
      () => service.findActive(),
    );

    expect(lookupContext).toEqual({ tenantId: null, isSuperAdmin: true });
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    expect(tenants).toEqual([
      { id: 'colegio-pruebas', name: 'Colegio Pruebas' },
    ]);
  });

  it('es idempotente para el mismo par local-canónico y conserva la auditoría original', async () => {
    const existing = mapping();
    const prisma = {
      tenantCanonicalMapping: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
      tenant: { findUnique: jest.fn() },
    };
    const service = new TenantsService(prisma as unknown as PrismaService);

    const result = await service.assignCanonicalMapping({
      tenantId: 'colegio-a',
      canonicalTenantId,
      assignedByUserId: 'operator-2',
      reason: 'Reintento seguro',
      correlationId: 'retry-1',
    });

    expect(result).toEqual({ ...existing, created: false });
    expect(prisma.tenantCanonicalMapping.create).not.toHaveBeenCalled();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('impide que el UUID canónico de un tenant sea reutilizado por otro tenant local', async () => {
    const prisma = {
      tenantCanonicalMapping: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ tenantId: 'colegio-a' }),
        create: jest.fn(),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'colegio-b' }) },
    };
    const service = new TenantsService(prisma as unknown as PrismaService);

    await expect(
      service.assignCanonicalMapping({
        tenantId: 'colegio-b',
        canonicalTenantId,
        assignedByUserId: 'operator-1',
        reason: 'No debe cruzar tenants',
      }),
    ).rejects.toThrow('ya está asociado al tenant local colegio-a');

    expect(prisma.tenantCanonicalMapping.create).not.toHaveBeenCalled();
  });

  it('resuelve una carrera concurrente como reintento idempotente del mismo par', async () => {
    const concurrent = mapping();
    const prisma = {
      tenantCanonicalMapping: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(concurrent),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'colegio-a' }) },
    };
    const service = new TenantsService(prisma as unknown as PrismaService);

    await expect(
      service.assignCanonicalMapping({
        tenantId: 'colegio-a',
        canonicalTenantId,
        assignedByUserId: 'operator-1',
        reason: 'Intento concurrente',
      }),
    ).resolves.toEqual({ ...concurrent, created: false });
  });

  it('permite validar en dry-run sin crear datos de mapeo', async () => {
    const prisma = {
      tenantCanonicalMapping: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest.fn(),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'colegio-a' }) },
    };
    const service = new TenantsService(prisma as unknown as PrismaService);

    await expect(
      service.assignCanonicalMapping({
        tenantId: 'colegio-a',
        canonicalTenantId: canonicalTenantId.toUpperCase(),
        assignedByUserId: 'operator-1',
        reason: 'Preflight de staging',
        dryRun: true,
      }),
    ).resolves.toEqual({
      tenantId: 'colegio-a',
      canonicalTenantId,
      dryRun: true,
      created: false,
    });
    expect(prisma.tenantCanonicalMapping.create).not.toHaveBeenCalled();
  });
});
