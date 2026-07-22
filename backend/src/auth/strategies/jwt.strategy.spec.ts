import { ConfigService } from '@nestjs/config';
import { tenantContext } from '../../core/tenant/tenant.context';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const config = {
    get: jest.fn().mockReturnValue('jwt-strategy-test-secret'),
  } as unknown as ConfigService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carga al SUPER_ADMIN fuera del scope tenant y conserva el tenant elegido', async () => {
    let lookupContext: ReturnType<typeof tenantContext.getStore>;
    prisma.user.findUnique.mockImplementation(() => {
      lookupContext = tenantContext.getStore();
      return {
        id: 'super-admin-id',
        email: 'superadmin@edupay.example',
        name: 'Super Admin',
        isActive: true,
        tenantId: null,
        role: { name: 'SUPER_ADMIN', permissions: [] },
      };
    });
    const strategy = new JwtStrategy(
      config,
      prisma as unknown as PrismaService,
    );
    const requestContext = {
      tenantId: 'colegio-pruebas',
      isSuperAdmin: false,
    };

    const user = await tenantContext.run(requestContext, () =>
      strategy.validate({ sub: 'super-admin-id', role: 'SUPER_ADMIN' }),
    );

    expect(lookupContext).toEqual({ tenantId: null, isSuperAdmin: true });
    expect(requestContext).toEqual({
      tenantId: 'colegio-pruebas',
      isSuperAdmin: true,
    });
    expect(user).toMatchObject({
      id: 'super-admin-id',
      role: 'SUPER_ADMIN',
    });
  });
});
