import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Credential = {
  readonly keyId: string;
  readonly token: string;
  readonly canonicalTenantId: string;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AcademicFinancialProjectionConfigService {
  constructor(private readonly config: ConfigService) {}

  enabled(): boolean {
    return (
      this.config.get<string>('ACADEMIC_FINANCIAL_PROJECTION_ENABLED') ===
      'true'
    );
  }

  requireInboundCredentials(): Credential[] {
    this.requireEnabled();
    return this.credentials(
      'ACADEMIC_FINANCIAL_PROJECTION_INBOUND_CREDENTIALS',
    );
  }

  snapshotCredential(canonicalTenantId: string): Credential {
    this.requireEnabled();
    const credential = this.credentials(
      'ACADEMIC_FINANCIAL_PROJECTION_SNAPSHOT_CREDENTIALS',
    ).find((candidate) => candidate.canonicalTenantId === canonicalTenantId);
    if (!credential) {
      throw new ServiceUnavailableException(
        'No Academic snapshot service credential is configured for this canonical tenant.',
      );
    }
    return credential;
  }

  academicBaseUrl(): string {
    this.requireEnabled();
    const value = this.config
      .get<string>('ACADEMIC_FINANCIAL_PROJECTION_BASE_URL')
      ?.replace(/\/+$/, '');
    try {
      const url = value ? new URL(value) : null;
      if (
        !url ||
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error('invalid');
      }
      return url.toString().replace(/\/+$/, '');
    } catch {
      throw new ServiceUnavailableException(
        'Academic Financial Projection base URL is not configured.',
      );
    }
  }

  timeoutMs(): number {
    const value = Number(
      this.config.get<string>('ACADEMIC_FINANCIAL_PROJECTION_TIMEOUT_MS') ??
        5_000,
    );
    return Number.isSafeInteger(value) && value >= 100 && value <= 30_000
      ? value
      : 5_000;
  }

  private requireEnabled(): void {
    if (!this.enabled()) {
      throw new ServiceUnavailableException(
        'Academic Financial Projection shadow mode is disabled.',
      );
    }
  }

  private credentials(key: string): Credential[] {
    const raw = this.config.get<string>(key);
    try {
      const value: unknown = JSON.parse(raw ?? '[]');
      if (!Array.isArray(value) || value.length === 0) throw new Error('empty');
      const seen = new Set<string>();
      const parsed = value.map((item): Credential => {
        if (
          typeof item !== 'object' ||
          item === null ||
          typeof (item as Credential).keyId !== 'string' ||
          typeof (item as Credential).token !== 'string' ||
          typeof (item as Credential).canonicalTenantId !== 'string'
        )
          throw new Error('shape');
        const credential = item as Credential;
        if (
          !/^[A-Za-z0-9._-]{3,80}$/.test(credential.keyId) ||
          credential.token.length < 32 ||
          /\s/.test(credential.token) ||
          !UUID.test(credential.canonicalTenantId) ||
          seen.has(credential.keyId)
        )
          throw new Error('value');
        seen.add(credential.keyId);
        return {
          ...credential,
          canonicalTenantId: credential.canonicalTenantId.toLowerCase(),
        };
      });
      return parsed;
    } catch {
      throw new ServiceUnavailableException(
        `Academic Financial Projection credentials are not configured (${key}).`,
      );
    }
  }
}
