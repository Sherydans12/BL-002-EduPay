import {
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class PortalApiKeyMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction): void {
    const authorization = request.header('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    const receivedToken = match?.[1]?.trim();
    const tenantId = request.header('x-tenant-id')?.trim();

    if (!tenantId) {
      throw new BadRequestException('El header x-tenant-id es obligatorio');
    }

    const rawTenantKeys = process.env.PORTAL_TENANT_KEYS;
    let tenantKeys: Record<string, string>;

    try {
      const parsed = rawTenantKeys
        ? (JSON.parse(rawTenantKeys) as unknown)
        : null;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        Object.keys(parsed).length === 0 ||
        Object.values(parsed).some(
          (value) => typeof value !== 'string' || value.length === 0,
        )
      ) {
        throw new Error('Invalid PORTAL_TENANT_KEYS');
      }
      tenantKeys = parsed as Record<string, string>;
    } catch {
      throw new InternalServerErrorException(
        'La integración con el Portal de Pagos no está configurada correctamente',
      );
    }

    const expectedToken = tenantKeys[tenantId];

    if (
      !receivedToken ||
      !expectedToken ||
      !this.tokensMatch(receivedToken, expectedToken)
    ) {
      throw new UnauthorizedException('Bearer Token del portal inválido');
    }

    request.headers['x-tenant-id'] = tenantId;
    next();
  }

  private tokensMatch(receivedToken: string, expectedToken: string): boolean {
    const received = Buffer.from(receivedToken);
    const expected = Buffer.from(expectedToken);

    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  }
}
