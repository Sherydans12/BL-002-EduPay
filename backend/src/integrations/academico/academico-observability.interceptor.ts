import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { AcademicoRequest } from './academico-integration.types';

@Injectable()
export class AcademicoObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AcademicoObservabilityInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<AcademicoRequest>();

    return next.handle().pipe(
      tap((result: unknown) => {
        const response = this.responseCounts(result);
        this.logger.log({
          event: 'ACADEMICO_INTEGRATION_REQUEST',
          route: request.route?.path ?? request.path,
          sourceTenantId: request.academicoIntegration?.sourceTenantId,
          correlationId: request.academicoIntegration?.correlationId,
          durationMs: Date.now() - startedAt,
          ...response,
        });
      }),
      catchError((error: unknown) => {
        this.logger.warn({
          event: 'ACADEMICO_INTEGRATION_REQUEST_FAILED',
          route: request.route?.path ?? request.path,
          sourceTenantId: request.academicoIntegration?.sourceTenantId,
          correlationId: request.academicoIntegration?.correlationId,
          durationMs: Date.now() - startedAt,
          errorCategory: this.errorCategory(error),
        });
        return throwError(() => error);
      }),
    );
  }

  private responseCounts(result: unknown): Record<string, number | boolean> {
    if (!result || typeof result !== 'object') return {};
    const value = result as {
      items?: unknown[];
      conflicts?: unknown[];
      page?: { complete?: boolean };
    };
    return {
      itemCount: value.items?.length ?? 0,
      conflictCount: value.conflicts?.length ?? 0,
      complete: value.page?.complete ?? true,
    };
  }

  private errorCategory(error: unknown): string {
    if (!(error instanceof HttpException)) return 'INTERNAL_ERROR';
    const response = error.getResponse();
    if (response && typeof response === 'object' && 'code' in response) {
      return String((response as { code: unknown }).code);
    }
    return `HTTP_${error.getStatus()}`;
  }
}
