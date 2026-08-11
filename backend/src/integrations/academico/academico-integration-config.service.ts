import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { integrationHttpException } from './academico-integration.types';
import { HttpStatus } from '@nestjs/common';

const MINIMUM_SECRET_LENGTH = 32;

@Injectable()
export class AcademicoIntegrationConfigService {
  constructor(private readonly config: ConfigService) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      this.assertProductionConfiguration();
    }
  }

  authenticationTokens(): string[] {
    const tokens = [
      this.config.get<string>('EDUPAY_ACADEMICO_INTEGRATION_TOKEN'),
      this.config.get<string>('EDUPAY_ACADEMICO_INTEGRATION_TOKEN_PREVIOUS'),
    ].filter((value): value is string => Boolean(value));

    if (
      tokens.length === 0 ||
      tokens.some((token) => token.length < MINIMUM_SECRET_LENGTH)
    ) {
      throw integrationHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'INTEGRATION_NOT_CONFIGURED',
        'Académico integration is not configured',
      );
    }

    return tokens;
  }

  cursorSecret(): string {
    const value =
      this.config.get<string>('EDUPAY_ACADEMICO_CURSOR_SECRET') ??
      this.authenticationTokens()[0];

    if (!value || value.length < MINIMUM_SECRET_LENGTH) {
      throw integrationHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'INTEGRATION_NOT_CONFIGURED',
        'Académico integration is not configured',
      );
    }

    return value;
  }

  allowedTenants(): ReadonlySet<string> {
    const raw = this.config.get<string>('EDUPAY_ACADEMICO_ALLOWED_TENANTS');
    const tenants = new Set(
      (raw ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );

    if (tenants.size === 0) {
      throw integrationHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'INTEGRATION_NOT_CONFIGURED',
        'Académico integration is not configured',
      );
    }

    return tenants;
  }

  requestsPerMinute(): number {
    const raw = this.config.get<string>(
      'EDUPAY_ACADEMICO_RATE_LIMIT_PER_MINUTE',
    );
    const parsed = raw ? Number(raw) : 120;
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 120;
  }

  private assertProductionConfiguration(): void {
    try {
      this.authenticationTokens();
      this.cursorSecret();
      this.allowedTenants();
    } catch {
      throw new Error(
        'Missing or invalid production configuration for the Académico integration',
      );
    }
  }
}
