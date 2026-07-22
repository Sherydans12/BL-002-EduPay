import { tenantContext } from '../core/tenant/tenant.context';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from './tenants.service';

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
});
