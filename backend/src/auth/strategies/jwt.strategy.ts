import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../core/tenant/tenant.context';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') || 'super-secret-key',
    });
  }

  /**
   * Carga los permisos frescos desde la base de datos en cada request.
   * Esto garantiza que los cambios de roles/permisos surtan efecto
   * de inmediato sin requerir que el usuario vuelva a iniciar sesión.
   */
  async validate(payload: any) {
    const loadUser = () =>
      this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          role: {
            include: { permissions: true },
          },
        },
      });
    // La identidad es global. No debe buscarse bajo el tenant seleccionado,
    // porque los SUPER_ADMIN no tienen tenantId y quedarían filtrados por Prisma.
    const user = await tenantContext.run(
      { tenantId: '', isSuperAdmin: false },
      loadUser,
    );

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sesión inválida o usuario inactivo');
    }

    const permissions = user.role?.permissions.map((p) => p.action) ?? [];
    const context = tenantContext.getStore();
    const isSuperAdmin = user.role?.name === 'SUPER_ADMIN';
    if (context) {
      context.tenantId = isSuperAdmin
        ? context.tenantId
        : (user.tenantId ?? '');
      context.isSuperAdmin = isSuperAdmin;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      role: user.role?.name,
      permissions,
    };
  }
}
