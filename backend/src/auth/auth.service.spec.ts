import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  it('firma el JWT con el nombre explícito del rol', async () => {
    const role = {
      name: 'SUPER_ADMIN',
      permissions: [{ action: 'tenants.read' }],
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'super-admin-id',
          email: 'superadmin@edupay.example',
          name: 'Super Admin',
          password: 'hash',
          isActive: true,
          tenantId: null,
          role,
        }),
      },
    };
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
    };
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
    const service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
    );

    await service.login('superadmin@edupay.example', 'password');

    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 'super-admin-id',
      email: 'superadmin@edupay.example',
      tenantId: null,
      role: 'SUPER_ADMIN',
      permissions: ['tenants.read'],
    });
  });
});
