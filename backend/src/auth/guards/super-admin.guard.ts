import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    if (user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Acceso exclusivo para SUPER_ADMIN');
    }

    return true;
  }
}
