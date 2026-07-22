import {
  Injectable,
  NestMiddleware,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from './tenant.context';

type TenantJwtPayload = {
  tenantId?: string | null;
  role?: string;
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
    const payload = this.verifyPanelToken(request);
    const isSuperAdmin = payload?.role === 'SUPER_ADMIN';
    const tenantId = payload
      ? isSuperAdmin
        ? headerTenantId || ''
        : payload.tenantId?.trim() || ''
      : headerTenantId || '';

    if (payload && !isSuperAdmin && !tenantId) {
      throw new UnauthorizedException(
        'El usuario autenticado no tiene un tenant asignado',
      );
    }

    if (tenantId) {
      await this.assertTenantIsActive(tenantId);
    }

    tenantContext.run({ tenantId, isSuperAdmin }, next);
  }

  private async assertTenantIsActive(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException(
        `Tenant no encontrado o inactivo: ${tenantId}`,
      );
    }
  }

  private verifyPanelToken(request: Request): TenantJwtPayload | null {
    const authorization = request.header('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();

    if (!token) return null;

    try {
      return this.jwtService.verify<TenantJwtPayload>(token);
    } catch {
      // El Bearer de Portal no es JWT. La autenticación definitiva sigue
      // perteneciendo al guard JWT o al middleware S2S correspondiente.
      return null;
    }
  }
}
