import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { tenantContext } from '../core/tenant/tenant.context';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  findActive() {
    return tenantContext.run({ tenantId: null, isSuperAdmin: true }, () =>
      this.prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async findCanonicalMapping(tenantId: string) {
    const mapping = await this.findMappingByTenantId(tenantId);
    if (!mapping) {
      throw new NotFoundException(
        'No existe un mapeo canónico para el tenant local indicado',
      );
    }

    return this.toMappingResponse(mapping, false);
  }

  async assignCanonicalMapping(input: {
    tenantId: string;
    canonicalTenantId: string;
    reason: string;
    assignedByUserId?: string;
    correlationId?: string;
    dryRun?: boolean;
  }) {
    if (!input.assignedByUserId) {
      throw new ForbiddenException('No se pudo identificar al operador');
    }

    const canonicalTenantId = input.canonicalTenantId.toLowerCase();
    const correlationId = this.resolveCorrelationId(input.correlationId);
    const mappingForTenant = await this.findMappingByTenantId(input.tenantId);

    if (mappingForTenant) {
      return this.resolveExistingTenantMapping(
        mappingForTenant,
        canonicalTenantId,
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('El tenant local indicado no existe');
    }

    const mappingForCanonicalTenant =
      await this.prisma.tenantCanonicalMapping.findUnique({
        where: { canonicalTenantId },
        select: { tenantId: true },
      });
    if (mappingForCanonicalTenant) {
      throw this.canonicalTenantAlreadyMapped(
        canonicalTenantId,
        mappingForCanonicalTenant.tenantId,
      );
    }

    if (input.dryRun) {
      return {
        tenantId: input.tenantId,
        canonicalTenantId,
        dryRun: true,
        created: false,
      };
    }

    try {
      const mapping = await this.prisma.tenantCanonicalMapping.create({
        data: {
          tenantId: input.tenantId,
          canonicalTenantId,
          assignedByUserId: input.assignedByUserId,
          correlationId,
          reason: input.reason,
        },
        select: this.mappingSelect,
      });
      return this.toMappingResponse(mapping, true);
    } catch (error) {
      if (!this.isUniqueConstraint(error)) {
        throw error;
      }

      // Dos operadores pueden intentar configurar el mismo par al mismo
      // tiempo. Las restricciones únicas son la autoridad y esta relectura
      // mantiene el POST idempotente sin sobrescribir datos de auditoría.
      const concurrentForTenant = await this.findMappingByTenantId(
        input.tenantId,
      );
      if (concurrentForTenant) {
        return this.resolveExistingTenantMapping(
          concurrentForTenant,
          canonicalTenantId,
        );
      }

      const concurrentForCanonicalTenant =
        await this.prisma.tenantCanonicalMapping.findUnique({
          where: { canonicalTenantId },
          select: { tenantId: true },
        });
      if (concurrentForCanonicalTenant) {
        throw this.canonicalTenantAlreadyMapped(
          canonicalTenantId,
          concurrentForCanonicalTenant.tenantId,
        );
      }

      throw error;
    }
  }

  private readonly mappingSelect = {
    tenantId: true,
    canonicalTenantId: true,
    assignedByUserId: true,
    correlationId: true,
    reason: true,
    createdAt: true,
  };

  private findMappingByTenantId(tenantId: string) {
    return this.prisma.tenantCanonicalMapping.findUnique({
      where: { tenantId },
      select: this.mappingSelect,
    });
  }

  private resolveExistingTenantMapping(
    mapping: { tenantId: string; canonicalTenantId: string },
    canonicalTenantId: string,
  ) {
    if (mapping.canonicalTenantId !== canonicalTenantId) {
      throw new ConflictException(
        'El tenant local ya está asociado a otro tenant canónico',
      );
    }

    return this.toMappingResponse(mapping, false);
  }

  private canonicalTenantAlreadyMapped(
    canonicalTenantId: string,
    tenantId: string,
  ) {
    return new ConflictException(
      `El tenant canónico ${canonicalTenantId} ya está asociado al tenant local ${tenantId}`,
    );
  }

  private resolveCorrelationId(value?: string) {
    if (value === undefined || value.trim() === '') {
      return randomUUID();
    }

    const correlationId = value.trim();
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(correlationId)) {
      throw new BadRequestException(
        'x-correlation-id no tiene un formato válido',
      );
    }

    return correlationId;
  }

  private isUniqueConstraint(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private toMappingResponse(
    mapping: {
      tenantId: string;
      canonicalTenantId: string;
      assignedByUserId?: string;
      correlationId?: string;
      reason?: string;
      createdAt?: Date;
    },
    created: boolean,
  ) {
    return { ...mapping, created };
  }
}
