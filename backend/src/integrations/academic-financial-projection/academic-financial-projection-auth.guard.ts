import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { AcademicFinancialProjectionConfigService } from './academic-financial-projection-config.service';

export type AcademicFinancialProjectionRequest = Request & {
  academicFinancialProjectionPrincipal?: {
    readonly canonicalTenantId: string;
    readonly keyId: string;
  };
};

@Injectable()
export class AcademicFinancialProjectionAuthGuard implements CanActivate {
  private readonly logger = new Logger(
    AcademicFinancialProjectionAuthGuard.name,
  );

  constructor(
    private readonly config: AcademicFinancialProjectionConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AcademicFinancialProjectionRequest>();
    const keyId = request.header('x-edupay-service-key-id')?.trim();
    const service = request.header('x-edupay-service')?.trim();
    const token = request
      .header('authorization')
      ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    const credential = this.config
      .requireInboundCredentials()
      .find((item) => item.keyId === keyId);
    if (
      service !== 'ACADEMIC_PRODUCER' ||
      !token ||
      !credential ||
      !this.matches(token, credential.token)
    ) {
      this.logger.warn({
        action: 'ACADEMIC_FINANCIAL_PROJECTION_AUTH_REJECTED',
        service: service ?? null,
        keyId: keyId ?? null,
      });
      throw new UnauthorizedException(
        'A registered Academic producer service credential is required.',
      );
    }
    request.academicFinancialProjectionPrincipal = {
      canonicalTenantId: credential.canonicalTenantId,
      keyId: credential.keyId,
    };
    return true;
  }

  private matches(value: string, secret: string): boolean {
    return timingSafeEqual(
      createHash('sha256').update(value).digest(),
      createHash('sha256').update(secret).digest(),
    );
  }
}
