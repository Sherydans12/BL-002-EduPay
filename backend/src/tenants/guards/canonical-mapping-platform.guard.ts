import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { tenantContext } from '../../core/tenant/tenant.context';
import { SuperAdminGuard } from '../../auth/guards/super-admin.guard';

type MappingPlatformRequest = {
  user?: {
    id?: unknown;
  };
};

/**
 * Policy boundary for the platform-level canonical mapping surface.
 *
 * SuperAdminGuard remains the authority for the local role. This guard adds
 * the second half of the policy: a validated operator identity and an empty
 * tenant context. A tenant selected by the browser is therefore never used
 * to authorize this cross-tenant configuration operation.
 */
@Injectable()
export class CanonicalMappingPlatformGuard extends SuperAdminGuard {
  override canActivate(context: ExecutionContext): boolean {
    super.canActivate(context);

    const request = context.switchToHttp().getRequest<MappingPlatformRequest>();
    const platformContext = tenantContext.getStore();

    if (!platformContext?.isSuperAdmin || platformContext.tenantId !== null) {
      throw new ForbiddenException(
        'La vinculación canónica requiere contexto de plataforma',
      );
    }

    if (
      typeof request.user?.id !== 'string' ||
      request.user.id.trim().length === 0
    ) {
      throw new ForbiddenException('No se pudo identificar al operador');
    }

    return true;
  }
}
