import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from './tenant.context';

type TenantJwtPayload = {
  tenantId?: string | null;
  role?: string | { name?: string | null } | null;
};

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly jwtService: JwtService;

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.jwtService = new JwtService({
      secret: configService.get<string>('JWT_SECRET') || 'super-secret-key',
    });
  }

  async use(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> {
    const headerTenantId = request.header('x-tenant-id')?.trim();
    const payload = this.decodePanelToken(request);
    const roleName =
      typeof payload?.role === 'string' ? payload.role : payload?.role?.name;
    const isSuperAdmin = roleName === 'SUPER_ADMIN';
    const tenantId = isSuperAdmin
      ? headerTenantId || null
      : payload?.tenantId?.trim() || headerTenantId || null;

    if (tenantId) {
      await this.assertTenantExists(tenantId);
    }

    tenantContext.run({ tenantId, isSuperAdmin }, () => next());
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('El colegio seleccionado no existe');
    }
  }

  private decodePanelToken(request: Request): TenantJwtPayload | null {
    const authorization = request.header('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();

    if (!token) return null;

    try {
      const decoded = this.jwtService.decode<TenantJwtPayload>(token);
      return decoded && typeof decoded === 'object' ? decoded : null;
    } catch {
      // El Bearer de Portal no es JWT. La autenticación definitiva sigue
      // perteneciendo al guard JWT o al middleware S2S correspondiente.
      return null;
    }
  }
}
