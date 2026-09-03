import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AcademicFinancialProjectionConfigService } from './academic-financial-projection-config.service';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set([
  'academic.financial-projection.enrollment.upserted.v1',
  'academic.financial-projection.enrollment.tombstoned.v1',
]);

export type AcademicFinancialProjectionEvent = {
  readonly eventId: string;
  readonly eventType: string;
  readonly schemaVersion: '1';
  readonly canonicalTenantId: string;
  readonly aggregateType: 'ACADEMIC_ENROLLMENT';
  readonly aggregateId: string;
  readonly entityVersion: number;
  readonly occurredAt: string;
  readonly correlationId: string | null;
  readonly payload: {
    readonly canonicalTenantId: string;
    readonly academicYearId: string;
    readonly academicStudentId: string;
    readonly academicCourseId: string;
    readonly academicEnrollmentId: string;
    readonly enrollmentStatus: 'ACTIVE' | 'INACTIVE';
    readonly effectiveFrom: string;
    readonly effectiveTo: string | null;
    readonly version: number;
    readonly updatedAt: string;
    readonly operation: 'UPSERT' | 'TOMBSTONE';
  };
};

export type ProjectionOutcome =
  'APPLIED' | 'DUPLICATE' | 'STALE' | 'QUARANTINED';

@Injectable()
export class AcademicFinancialProjectionService {
  private readonly logger = new Logger(AcademicFinancialProjectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AcademicFinancialProjectionConfigService,
  ) {}

  async consume(
    raw: unknown,
    authorizedCanonicalTenantId: string,
    requestCorrelationId?: string,
  ): Promise<{ outcome: ProjectionOutcome; reasonCode?: string }> {
    if (!this.config.enabled()) {
      throw new ServiceUnavailableException(
        'Academic Financial Projection shadow mode is disabled.',
      );
    }
    let event: AcademicFinancialProjectionEvent;
    try {
      event = this.parseEvent(raw);
    } catch {
      const reasonCode = 'INVALID_CONTRACT';
      await this.quarantineInvalid(raw, reasonCode, requestCorrelationId);
      return { outcome: 'QUARANTINED', reasonCode };
    }
    if (event.canonicalTenantId !== authorizedCanonicalTenantId) {
      throw new ForbiddenException(
        'The service credential is not authorized for the event tenant.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const seen = await tx.academicFinancialProjectionConsumedEvent.findUnique(
        {
          where: {
            producer_canonicalTenantId_eventId: {
              producer: 'ACADEMIC',
              canonicalTenantId: event.canonicalTenantId,
              eventId: event.eventId,
            },
          },
        },
      );
      if (seen) return { outcome: 'DUPLICATE' as const };

      const mapping = await tx.tenantCanonicalMapping.findUnique({
        where: { canonicalTenantId: event.canonicalTenantId },
        select: { tenantId: true },
      });
      if (!mapping) {
        await tx.academicFinancialProjectionConsumedEvent.create({
          data: {
            producer: 'ACADEMIC',
            canonicalTenantId: event.canonicalTenantId,
            eventId: event.eventId,
            aggregateId: event.aggregateId,
            entityVersion: BigInt(event.entityVersion),
            outcome: 'QUARANTINED',
            reasonCode: 'CANONICAL_TENANT_MAPPING_MISSING',
            correlationId: event.correlationId ?? requestCorrelationId ?? null,
          },
        });
        await tx.academicFinancialProjectionQuarantine.create({
          data: {
            producer: 'ACADEMIC',
            canonicalTenantId: event.canonicalTenantId,
            eventId: event.eventId,
            reasonCode: 'CANONICAL_TENANT_MAPPING_MISSING',
            correlationId: event.correlationId ?? requestCorrelationId ?? null,
            payload: raw as Prisma.InputJsonValue,
          },
        });
        this.logger.warn({
          action: 'ACADEMIC_FINANCIAL_PROJECTION_QUARANTINED',
          eventId: event.eventId,
          canonicalTenantId: event.canonicalTenantId,
          reasonCode: 'CANONICAL_TENANT_MAPPING_MISSING',
        });
        return {
          outcome: 'QUARANTINED' as const,
          reasonCode: 'CANONICAL_TENANT_MAPPING_MISSING',
        };
      }
      return this.applyEvent(tx, event, mapping.tenantId, requestCorrelationId);
    });
  }

  async applySnapshotItem(input: {
    tenantId: string;
    canonicalTenantId: string;
    snapshotId: string;
    item: AcademicFinancialProjectionEvent['payload'];
  }): Promise<'APPLIED' | 'STALE'> {
    const item = this.parsePayload(input.item);
    if (item.canonicalTenantId !== input.canonicalTenantId) {
      throw new ForbiddenException(
        'The snapshot item tenant is not authorized.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.academicFinancialProjection.findUnique({
        where: {
          tenantId_academicEnrollmentId: {
            tenantId: input.tenantId,
            academicEnrollmentId: item.academicEnrollmentId,
          },
        },
      });
      const stale = current && current.version >= BigInt(item.version);
      if (stale) {
        await tx.academicFinancialProjection.update({
          where: { id: current.id },
          data: { lastSnapshotId: input.snapshotId },
        });
        return 'STALE';
      }
      await tx.academicFinancialProjection.upsert({
        where: {
          tenantId_academicEnrollmentId: {
            tenantId: input.tenantId,
            academicEnrollmentId: item.academicEnrollmentId,
          },
        },
        create: this.projectionData(input.tenantId, item, {
          lastSnapshotId: input.snapshotId,
        }),
        update: this.projectionData(input.tenantId, item, {
          lastSnapshotId: input.snapshotId,
        }),
      });
      return 'APPLIED';
    });
  }

  async reconcileSnapshot(tenantId: string, snapshotId: string) {
    const snapshot =
      await this.prisma.academicFinancialProjectionSnapshot.findFirst({
        where: { id: snapshotId, tenantId },
      });
    if (!snapshot)
      throw new BadRequestException(
        'The local snapshot was not found for this tenant.',
      );
    if (snapshot.status !== 'COMPLETE' && snapshot.status !== 'RECONCILED') {
      throw new BadRequestException('A partial snapshot cannot be reconciled.');
    }
    const [seen, extra, tombstonePending] = await Promise.all([
      this.prisma.academicFinancialProjection.count({
        where: { tenantId, lastSnapshotId: snapshotId },
      }),
      this.prisma.academicFinancialProjection.count({
        where: {
          tenantId,
          OR: [
            { lastSnapshotId: { not: snapshotId } },
            { lastSnapshotId: null },
          ],
        },
      }),
      this.prisma.academicFinancialProjection.count({
        where: { tenantId, operation: 'TOMBSTONE', effectiveTo: null },
      }),
    ]);
    const expected = snapshot.expectedItemCount ?? snapshot.receivedItemCount;
    const report = {
      snapshotId,
      canonicalTenantId: snapshot.canonicalTenantId,
      expectedItemCount: expected,
      seen,
      missing: Math.max(expected - seen, 0),
      extra,
      stale: Math.max(snapshot.receivedItemCount - seen, 0),
      versionMismatch: 0,
      tenantMismatch: 0,
      mappingMissing: 0,
      tombstonePending,
      reconciled:
        expected === snapshot.receivedItemCount &&
        extra === 0 &&
        tombstonePending === 0,
    };
    if (report.reconciled && snapshot.status !== 'RECONCILED') {
      await this.prisma.academicFinancialProjectionSnapshot.update({
        where: { id: snapshot.id },
        data: { status: 'RECONCILED', reconciledAt: new Date() },
      });
    }
    return report;
  }

  async legacyComparison(tenantId: string) {
    const [legacyStudents, legacyCourses, projections] = await Promise.all([
      this.prisma.student.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.course.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.academicFinancialProjection.findMany({
        where: { tenantId },
        select: {
          academicStudentId: true,
          academicCourseId: true,
          academicYearId: true,
          operation: true,
        },
      }),
    ]);
    const active = projections.filter((item) => item.operation === 'UPSERT');
    return {
      tenantId,
      legacy: { students: legacyStudents, courses: legacyCourses },
      shadow: {
        activeEnrollments: active.length,
        students: new Set(active.map((item) => item.academicStudentId)).size,
        courses: new Set(active.map((item) => item.academicCourseId)).size,
        academicYears: new Set(active.map((item) => item.academicYearId)).size,
      },
      correspondence: {
        automaticMatching: false,
        studentsWithoutExplicitCorrespondence: new Set(
          active.map((item) => item.academicStudentId),
        ).size,
        coursesWithoutExplicitCorrespondence: new Set(
          active.map((item) => item.academicCourseId),
        ).size,
        note: 'No name, RUT, slug, or label matching is performed. This report is intentionally observational.',
      },
    };
  }

  private async applyEvent(
    tx: Prisma.TransactionClient,
    event: AcademicFinancialProjectionEvent,
    tenantId: string,
    requestCorrelationId?: string,
  ): Promise<{ outcome: ProjectionOutcome; reasonCode?: string }> {
    const current = await tx.academicFinancialProjection.findUnique({
      where: {
        tenantId_academicEnrollmentId: {
          tenantId,
          academicEnrollmentId: event.aggregateId,
        },
      },
    });
    if (current && current.version >= BigInt(event.entityVersion)) {
      await tx.academicFinancialProjectionConsumedEvent.create({
        data: {
          producer: 'ACADEMIC',
          canonicalTenantId: event.canonicalTenantId,
          eventId: event.eventId,
          tenantId,
          aggregateId: event.aggregateId,
          entityVersion: BigInt(event.entityVersion),
          outcome: 'STALE',
          reasonCode: 'ENTITY_VERSION_NOT_NEWER',
          correlationId: event.correlationId ?? requestCorrelationId ?? null,
        },
      });
      return { outcome: 'STALE', reasonCode: 'ENTITY_VERSION_NOT_NEWER' };
    }
    await tx.academicFinancialProjection.upsert({
      where: {
        tenantId_academicEnrollmentId: {
          tenantId,
          academicEnrollmentId: event.aggregateId,
        },
      },
      create: this.projectionData(tenantId, event.payload, {
        lastEventId: event.eventId,
      }),
      update: this.projectionData(tenantId, event.payload, {
        lastEventId: event.eventId,
      }),
    });
    await tx.academicFinancialProjectionConsumedEvent.create({
      data: {
        producer: 'ACADEMIC',
        canonicalTenantId: event.canonicalTenantId,
        eventId: event.eventId,
        tenantId,
        aggregateId: event.aggregateId,
        entityVersion: BigInt(event.entityVersion),
        outcome: 'APPLIED',
        correlationId: event.correlationId ?? requestCorrelationId ?? null,
      },
    });
    return { outcome: 'APPLIED' };
  }

  private projectionData(
    tenantId: string,
    payload: AcademicFinancialProjectionEvent['payload'],
    references: {
      readonly lastEventId?: string;
      readonly lastSnapshotId?: string;
    },
  ) {
    return {
      tenantId,
      canonicalTenantId: payload.canonicalTenantId,
      academicYearId: payload.academicYearId,
      academicStudentId: payload.academicStudentId,
      academicCourseId: payload.academicCourseId,
      academicEnrollmentId: payload.academicEnrollmentId,
      enrollmentStatus: payload.enrollmentStatus,
      effectiveFrom: new Date(payload.effectiveFrom),
      effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : null,
      version: BigInt(payload.version),
      sourceUpdatedAt: new Date(payload.updatedAt),
      operation: payload.operation,
      ...(references.lastEventId !== undefined
        ? { lastEventId: references.lastEventId }
        : {}),
      ...(references.lastSnapshotId !== undefined
        ? { lastSnapshotId: references.lastSnapshotId }
        : {}),
    };
  }

  private parseEvent(value: unknown): AcademicFinancialProjectionEvent {
    const record = this.record(value, [
      'eventId',
      'eventType',
      'schemaVersion',
      'canonicalTenantId',
      'aggregateType',
      'aggregateId',
      'entityVersion',
      'occurredAt',
      'correlationId',
      'payload',
    ]);
    const payload = this.parsePayload(record.payload);
    const event = {
      eventId: this.uuid(record.eventId),
      eventType: this.string(record.eventType),
      schemaVersion: this.string(record.schemaVersion),
      canonicalTenantId: this.uuid(record.canonicalTenantId),
      aggregateType: this.string(record.aggregateType),
      aggregateId: this.uuid(record.aggregateId),
      entityVersion: this.version(record.entityVersion),
      occurredAt: this.timestamp(record.occurredAt),
      correlationId:
        record.correlationId === null
          ? null
          : this.correlation(record.correlationId),
      payload,
    } as AcademicFinancialProjectionEvent;
    if (
      event.schemaVersion !== '1' ||
      !EVENT_TYPES.has(event.eventType) ||
      event.aggregateType !== 'ACADEMIC_ENROLLMENT' ||
      event.aggregateId !== payload.academicEnrollmentId ||
      event.entityVersion !== payload.version ||
      event.canonicalTenantId !== payload.canonicalTenantId ||
      (event.eventType.endsWith('tombstoned.v1')
        ? payload.operation !== 'TOMBSTONE'
        : payload.operation !== 'UPSERT')
    )
      throw new Error('contract mismatch');
    return event;
  }

  private parsePayload(
    value: unknown,
  ): AcademicFinancialProjectionEvent['payload'] {
    const record = this.record(value, [
      'canonicalTenantId',
      'academicYearId',
      'academicStudentId',
      'academicCourseId',
      'academicEnrollmentId',
      'enrollmentStatus',
      'effectiveFrom',
      'effectiveTo',
      'version',
      'updatedAt',
      'operation',
    ]);
    const payload = {
      canonicalTenantId: this.uuid(record.canonicalTenantId),
      academicYearId: this.uuid(record.academicYearId),
      academicStudentId: this.uuid(record.academicStudentId),
      academicCourseId: this.uuid(record.academicCourseId),
      academicEnrollmentId: this.uuid(record.academicEnrollmentId),
      enrollmentStatus: this.string(record.enrollmentStatus),
      effectiveFrom: this.timestamp(record.effectiveFrom),
      effectiveTo:
        record.effectiveTo === null ? null : this.timestamp(record.effectiveTo),
      version: this.version(record.version),
      updatedAt: this.timestamp(record.updatedAt),
      operation: this.string(record.operation),
    } as AcademicFinancialProjectionEvent['payload'];
    if (
      !['ACTIVE', 'INACTIVE'].includes(payload.enrollmentStatus) ||
      !['UPSERT', 'TOMBSTONE'].includes(payload.operation) ||
      (payload.effectiveTo &&
        new Date(payload.effectiveTo) < new Date(payload.effectiveFrom)) ||
      (payload.operation === 'TOMBSTONE' &&
        (payload.enrollmentStatus !== 'INACTIVE' ||
          payload.effectiveTo === null))
    )
      throw new Error('invalid payload');
    return payload;
  }

  private async quarantineInvalid(
    raw: unknown,
    reasonCode: string,
    correlationId?: string,
  ): Promise<void> {
    if (typeof raw !== 'object' || raw === null) return;
    const value = raw as Record<string, unknown>;
    if (
      typeof value.canonicalTenantId !== 'string' ||
      !UUID.test(value.canonicalTenantId)
    )
      return;
    await this.prisma.academicFinancialProjectionQuarantine
      .create({
        data: {
          canonicalTenantId: value.canonicalTenantId.toLowerCase(),
          eventId:
            typeof value.eventId === 'string' && UUID.test(value.eventId)
              ? value.eventId
              : null,
          reasonCode,
          correlationId: correlationId ?? null,
          payload: raw as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
  }

  private record(
    value: unknown,
    keys: readonly string[],
  ): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      throw new Error('object required');
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length !== keys.length ||
      Object.keys(record).some((key) => !keys.includes(key))
    )
      throw new Error('unexpected key');
    return record;
  }
  private uuid(value: unknown): string {
    const parsed = this.string(value).toLowerCase();
    if (!UUID.test(parsed)) throw new Error('uuid');
    return parsed;
  }
  private string(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0)
      throw new Error('string');
    return value;
  }
  private correlation(value: unknown): string {
    const parsed = this.string(value);
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(parsed))
      throw new Error('correlation');
    return parsed;
  }
  private version(value: unknown): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
      throw new Error('version');
    return value;
  }
  private timestamp(value: unknown): string {
    const parsed = this.string(value);
    if (
      Number.isNaN(new Date(parsed).getTime()) ||
      !/[zZ]|[+-]\d\d:\d\d$/.test(parsed)
    )
      throw new Error('timestamp');
    return new Date(parsed).toISOString();
  }
}
