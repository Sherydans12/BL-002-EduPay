import { Injectable } from '@nestjs/common';
import { tenantContext } from '../core/tenant/tenant.context';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  findActive() {
    return tenantContext.run({ tenantId: null, isSuperAdmin: true }, () =>
      this.prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    );
  }
}
