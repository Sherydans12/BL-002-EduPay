import {
  BadRequestException,
  Injectable,
  NestMiddleware,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class PortalApiKeyMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    const expectedToken = this.configService.get<string>('EDUPAY_API_KEY');

    if (!expectedToken) {
      throw new ServiceUnavailableException(
        'La integración con el Portal de Pagos no está configurada',
      );
    }

    const authorization = request.header('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    const receivedToken = match?.[1]?.trim();

    if (!receivedToken || !this.tokensMatch(receivedToken, expectedToken)) {
      throw new UnauthorizedException('Bearer Token del portal inválido');
    }

    const tenantId = request.header('x-tenant-id')?.trim();
    if (!tenantId) {
      throw new BadRequestException('El header x-tenant-id es obligatorio');
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
