import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../core/tenant/tenant.context';
import { AcademicoIntegrationConfigService } from './academico-integration-config.service';
import {
  AcademicoRequest,
  integrationHttpException,
} from './academico-integration.types';

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;

@Injectable()
export class AcademicoAuthGuard implements CanActivate {
  constructor(
    private readonly config: AcademicoIntegrationConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AcademicoRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const suppliedCorrelationId = request.header('x-correlation-id')?.trim();
    const correlationId =
      suppliedCorrelationId &&
      CORRELATION_ID_PATTERN.test(suppliedCorrelationId)
        ? suppliedCorrelationId
        : randomUUID();
    request.headers['x-correlation-id'] = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    const receivedToken = this.bearerToken(request.header('authorization'));
    const configuredTokens = this.config.authenticationTokens();

    if (
      !receivedToken ||
      !this.matchesAnyToken(receivedToken, configuredTokens)
    ) {
      throw integrationHttpException(
        HttpStatus.UNAUTHORIZED,
        'INTEGRATION_AUTHENTICATION_FAILED',
        'Integration authentication failed',
      );
    }

    const sourceTenantId = request.header('x-source-tenant-id')?.trim();
    if (!sourceTenantId) {
      throw integrationHttpException(
        HttpStatus.BAD_REQUEST,
        'SOURCE_TENANT_REQUIRED',
        'Exactly one source tenant is required',
      );
    }

    if (!this.config.allowedTenants().has(sourceTenantId)) {
      throw integrationHttpException(
        HttpStatus.FORBIDDEN,
        'INTEGRATION_TENANT_FORBIDDEN',
        'Source tenant is not allowed for this integration',
      );
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: sourceTenantId, isActive: true },
      select: { id: true },
    });
    if (!tenant) {
      throw integrationHttpException(
        HttpStatus.FORBIDDEN,
        'INTEGRATION_TENANT_FORBIDDEN',
        'Source tenant is not allowed for this integration',
      );
    }

    request.academicoIntegration = { sourceTenantId, correlationId };
    tenantContext.enterWith({ tenantId: sourceTenantId, isSuperAdmin: false });
    return true;
  }

  private bearerToken(authorization: string | undefined): string | null {
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    return match?.[1] ?? null;
  }

  private matchesAnyToken(received: string, configured: string[]): boolean {
    const receivedDigest = createHash('sha256').update(received).digest();
    let matches = false;

    for (const token of configured) {
      const configuredDigest = createHash('sha256').update(token).digest();
      matches = timingSafeEqual(receivedDigest, configuredDigest) || matches;
    }

    return matches;
  }
}
