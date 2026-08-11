import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AcademicoIntegrationConfigService } from './academico-integration-config.service';

export class InvalidAcademicoTokenError extends Error {}

@Injectable()
export class AcademicoTokenCodecService {
  constructor(private readonly config: AcademicoIntegrationConfigService) {}

  encode(payload: Record<string, unknown>): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    const signature = this.sign(encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  decode<T extends Record<string, unknown>>(token: string): T {
    if (!token || token.length > 4096) {
      throw new InvalidAcademicoTokenError();
    }

    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new InvalidAcademicoTokenError();
    }

    const expected = Buffer.from(this.sign(parts[0]));
    const received = Buffer.from(parts[1]);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
      throw new InvalidAcademicoTokenError();
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(parts[0], 'base64url').toString('utf8'),
      ) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new InvalidAcademicoTokenError();
      }
      return parsed as T;
    } catch (error) {
      if (error instanceof InvalidAcademicoTokenError) throw error;
      throw new InvalidAcademicoTokenError();
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.config.cursorSecret())
      .update(payload)
      .digest('base64url');
  }
}
