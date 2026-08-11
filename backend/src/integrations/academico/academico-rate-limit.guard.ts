import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { AcademicoIntegrationConfigService } from './academico-integration-config.service';
import {
  AcademicoRequest,
  integrationHttpException,
} from './academico-integration.types';

type RateWindow = { startedAt: number; count: number };
const WINDOW_MS = 60_000;

@Injectable()
export class AcademicoRateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, RateWindow>();

  constructor(private readonly config: AcademicoIntegrationConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AcademicoRequest>();
    const tenantId = request.academicoIntegration?.sourceTenantId;
    if (!tenantId) return false;

    const now = Date.now();
    const current = this.windows.get(tenantId);
    const window =
      !current || now - current.startedAt >= WINDOW_MS
        ? { startedAt: now, count: 0 }
        : current;

    window.count += 1;
    this.windows.set(tenantId, window);

    if (window.count > this.config.requestsPerMinute()) {
      throw integrationHttpException(
        HttpStatus.TOO_MANY_REQUESTS,
        'INTEGRATION_RATE_LIMITED',
        'Integration request rate exceeded',
      );
    }

    return true;
  }
}
