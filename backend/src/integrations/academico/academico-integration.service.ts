import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AcademicoFeedQueryDto } from './dto/academico-feed-query.dto';
import { AcademicoSnapshotCompletionQueryDto } from './dto/academico-snapshot-completion-query.dto';
import {
  ACADEMICO_DEFAULT_PAGE_SIZE,
  ACADEMICO_MAX_PAGE_SIZE,
  ACADEMICO_SCHEMA_VERSION,
  AcademicoEntity,
  AcademicoFeedMode,
  integrationHttpException,
} from './academico-integration.types';
import {
  AcademicoTokenCodecService,
  InvalidAcademicoTokenError,
} from './academico-token-codec.service';

type SequencePosition = { sequence: string; integrationId: string };

type PageCursor = Record<string, unknown> & {
  kind: 'page';
  schemaVersion: string;
  sourceTenantId: string;
  entity: AcademicoEntity;
  mode: AcademicoFeedMode;
  runId: string;
  capturedAt: string;
  lowerExclusive: string;
  upperExclusive: string;
  position: SequencePosition;
};

type PersistedWatermark = Record<string, unknown> & {
  kind: 'watermark';
  schemaVersion: string;
  sourceTenantId: string;
  entity: AcademicoEntity;
  sequence: string;
};

type SnapshotToken = Record<string, unknown> & {
  kind: 'snapshot';
  schemaVersion: string;
  sourceTenantId: string;
  runId: string;
  capturedAt: string;
  upperExclusive: string;
};

type FeedRun = {
  mode: AcademicoFeedMode;
  runId: string;
  capturedAt: string;
  lowerExclusive: bigint;
  upperExclusive: bigint;
  position?: { sequence: bigint; integrationId: string };
};

type CourseFeedRow = {
  integrationId: string;
  integrationCreatedSequence: bigint;
  integrationVersion: bigint;
  name: string;
  updatedAt: Date;
  deletedAt: Date | null;
};

type StudentFeedRow = {
  integrationId: string;
  integrationCreatedSequence: bigint;
  integrationVersion: bigint;
  firstName: string | null;
  lastName: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'GRADUATED';
  updatedAt: Date;
  deletedAt: Date | null;
  course: { integrationId: string };
};

@Injectable()
export class AcademicoIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AcademicoTokenCodecService,
  ) {}

  async createSnapshot(sourceTenantId: string) {
    const boundary = await this.captureBoundary();
    const snapshot: SnapshotToken = {
      kind: 'snapshot',
      schemaVersion: ACADEMICO_SCHEMA_VERSION,
      sourceTenantId,
      runId: randomUUID(),
      capturedAt: boundary.capturedAt,
      upperExclusive: boundary.sequence.toString(),
    };

    return {
      schemaVersion: ACADEMICO_SCHEMA_VERSION,
      sourceTenantId,
      snapshotToken: this.tokens.encode(snapshot),
      snapshot: {
        runId: snapshot.runId,
        capturedAt: snapshot.capturedAt,
        requiredEntities: ['COURSE', 'STUDENT'] as const,
        complete: false,
      },
    };
  }

  async courses(sourceTenantId: string, query: AcademicoFeedQueryDto) {
    const request = await this.resolveFeedRun('COURSE', sourceTenantId, query);
    const where = this.courseWhere(sourceTenantId, request.run);
    const rows = await this.prisma.course.findMany({
      where,
      orderBy: this.courseOrder(request.run.mode),
      take: request.limit + 1,
      select: {
        integrationId: true,
        integrationCreatedSequence: true,
        integrationVersion: true,
        name: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    return this.buildFeedResponse(
      'COURSE',
      sourceTenantId,
      request.run,
      request.limit,
      rows,
      (row) => this.mapCourse(sourceTenantId, row),
    );
  }

  completeSnapshot(
    sourceTenantId: string,
    query: AcademicoSnapshotCompletionQueryDto,
  ) {
    const snapshot = this.decodeSnapshot(query.snapshot);
    this.assertSnapshotScope(snapshot, sourceTenantId);
    const expected = this.sequence(snapshot.upperExclusive, 'INVALID_SNAPSHOT');
    const coursePosition = this.resolveWatermark(
      query.courseWatermark,
      'COURSE',
      sourceTenantId,
    );
    const studentPosition = this.resolveWatermark(
      query.studentWatermark,
      'STUDENT',
      sourceTenantId,
    );

    if (coursePosition !== expected || studentPosition !== expected) {
      throw integrationHttpException(
        HttpStatus.BAD_REQUEST,
        'INCOMPLETE_SNAPSHOT',
        'Both entity feeds must finish at the requested snapshot boundary',
      );
    }

    return {
      schemaVersion: ACADEMICO_SCHEMA_VERSION,
      sourceTenantId,
      snapshot: {
        runId: snapshot.runId,
        capturedAt: snapshot.capturedAt,
        completedAt: new Date().toISOString(),
        requiredEntities: ['COURSE', 'STUDENT'] as const,
        complete: true,
      },
    };
  }

  async students(sourceTenantId: string, query: AcademicoFeedQueryDto) {
    const request = await this.resolveFeedRun('STUDENT', sourceTenantId, query);
    const where = this.studentWhere(sourceTenantId, request.run);
    const rows = await this.prisma.student.findMany({
      where,
      orderBy: this.studentOrder(request.run.mode),
      take: request.limit + 1,
      select: {
        integrationId: true,
        integrationCreatedSequence: true,
        integrationVersion: true,
        firstName: true,
        lastName: true,
        status: true,
        updatedAt: true,
        deletedAt: true,
        course: { select: { integrationId: true } },
      },
    });

    return this.buildFeedResponse(
      'STUDENT',
      sourceTenantId,
      request.run,
      request.limit,
      rows,
      (row) => this.mapStudent(sourceTenantId, row),
    );
  }

  private async resolveFeedRun(
    entity: AcademicoEntity,
    sourceTenantId: string,
    query: AcademicoFeedQueryDto,
  ): Promise<{ run: FeedRun; limit: number }> {
    this.assertSchemaVersion(query.schemaVersion);
    const limit = this.pageSize(query.limit);

    if (query.cursor) {
      if (query.watermark || query.snapshot) {
        throw integrationHttpException(
          HttpStatus.BAD_REQUEST,
          'INVALID_CURSOR',
          'A continuation cursor cannot be combined with another position token',
        );
      }
      const cursor = this.decodePageCursor(query.cursor);
      this.assertCursorScope(cursor, entity, sourceTenantId, query.mode);
      return {
        limit,
        run: {
          mode: cursor.mode,
          runId: cursor.runId,
          capturedAt: cursor.capturedAt,
          lowerExclusive: this.sequence(
            cursor.lowerExclusive,
            'INVALID_CURSOR',
          ),
          upperExclusive: this.sequence(
            cursor.upperExclusive,
            'INVALID_CURSOR',
          ),
          position: {
            sequence: this.sequence(cursor.position.sequence, 'INVALID_CURSOR'),
            integrationId: cursor.position.integrationId,
          },
        },
      };
    }

    const mode = this.mode(query.mode);
    if (mode === 'full') {
      if (!query.snapshot || query.watermark) {
        throw integrationHttpException(
          HttpStatus.BAD_REQUEST,
          'FULL_SNAPSHOT_TOKEN_REQUIRED',
          'Full mode requires a snapshot token',
        );
      }
      const snapshot = this.decodeSnapshot(query.snapshot);
      this.assertSnapshotScope(snapshot, sourceTenantId);
      return {
        limit,
        run: {
          mode,
          runId: snapshot.runId,
          capturedAt: snapshot.capturedAt,
          lowerExclusive: 0n,
          upperExclusive: this.sequence(
            snapshot.upperExclusive,
            'INVALID_SNAPSHOT',
          ),
        },
      };
    }

    if (query.snapshot) {
      throw integrationHttpException(
        HttpStatus.BAD_REQUEST,
        'UNSUPPORTED_INTEGRATION_MODE',
        'Snapshot tokens are only supported in full mode',
      );
    }

    const lowerExclusive = query.watermark
      ? this.resolveWatermark(query.watermark, entity, sourceTenantId)
      : 0n;
    const boundary = await this.captureBoundary();
    return {
      limit,
      run: {
        mode,
        runId: randomUUID(),
        capturedAt: boundary.capturedAt,
        lowerExclusive,
        upperExclusive: boundary.sequence,
      },
    };
  }

  private buildFeedResponse<T extends CourseFeedRow | StudentFeedRow>(
    entity: AcademicoEntity,
    sourceTenantId: string,
    run: FeedRun,
    limit: number,
    fetchedRows: T[],
    mapRow: (row: T) => { item?: object; conflict?: object },
  ) {
    const hasNextPage = fetchedRows.length > limit;
    const rows = fetchedRows.slice(0, limit);
    const mapped = rows.map(mapRow);
    const items = mapped.flatMap((value) => (value.item ? [value.item] : []));
    const conflicts = mapped.flatMap((value) =>
      value.conflict ? [value.conflict] : [],
    );
    const last = rows.at(-1);
    const nextCursor =
      hasNextPage && last
        ? this.tokens.encode(
            this.pageCursor(
              entity,
              sourceTenantId,
              run,
              this.position(run, last),
            ),
          )
        : null;
    const nextWatermark = hasNextPage
      ? null
      : this.tokens.encode({
          kind: 'watermark',
          schemaVersion: ACADEMICO_SCHEMA_VERSION,
          sourceTenantId,
          entity,
          sequence: run.upperExclusive.toString(),
        } satisfies PersistedWatermark);

    return {
      schemaVersion: ACADEMICO_SCHEMA_VERSION,
      sourceTenantId,
      entity,
      mode: run.mode,
      items,
      conflicts,
      page: {
        limit,
        scannedCount: rows.length,
        itemCount: items.length,
        conflictCount: conflicts.length,
        nextCursor,
        complete: !hasNextPage,
      },
      watermark: {
        next: nextWatermark,
        available: !hasNextPage,
      },
      ...(run.mode === 'full'
        ? {
            snapshot: {
              runId: run.runId,
              capturedAt: run.capturedAt,
              entity,
              entityComplete: !hasNextPage,
              tenantSnapshotComplete: false,
              requiredEntities: ['COURSE', 'STUDENT'] as const,
            },
          }
        : { run: { runId: run.runId, capturedAt: run.capturedAt } }),
    };
  }

  private mapCourse(sourceTenantId: string, row: CourseFeedRow) {
    const name = row.name.trim();
    if (!name) {
      return {
        conflict: {
          code: 'COURSE_NAME_MISSING',
          entity: 'COURSE',
          integrationId: row.integrationId,
          sourceTenantId,
          updatedAt: row.updatedAt.toISOString(),
          deletedAt: row.deletedAt?.toISOString() ?? null,
        },
      };
    }

    return {
      item: {
        integrationId: row.integrationId,
        sourceTenantId,
        name,
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt?.toISOString() ?? null,
      },
    };
  }

  private mapStudent(sourceTenantId: string, row: StudentFeedRow) {
    const firstName = row.firstName?.trim() ?? '';
    const lastName = row.lastName?.trim() ?? '';
    if (!firstName || !lastName) {
      return {
        conflict: {
          code: 'STUDENT_STRUCTURED_NAME_MISSING',
          entity: 'STUDENT',
          integrationId: row.integrationId,
          sourceTenantId,
          updatedAt: row.updatedAt.toISOString(),
          deletedAt: row.deletedAt?.toISOString() ?? null,
        },
      };
    }

    return {
      item: {
        integrationId: row.integrationId,
        sourceTenantId,
        firstName,
        lastName,
        status: row.status,
        courseIntegrationId: row.course.integrationId,
        updatedAt: row.updatedAt.toISOString(),
        deletedAt: row.deletedAt?.toISOString() ?? null,
      },
    };
  }

  private courseWhere(
    sourceTenantId: string,
    run: FeedRun,
  ): Prisma.CourseWhereInput {
    const sequenceField =
      run.mode === 'full' ? 'integrationCreatedSequence' : 'integrationVersion';
    return {
      tenantId: sourceTenantId,
      AND: [
        run.mode === 'full'
          ? { integrationCreatedSequence: { lt: run.upperExclusive } }
          : {
              integrationVersion: {
                gt: run.lowerExclusive,
                lt: run.upperExclusive,
              },
            },
        ...(run.position
          ? [
              {
                OR: [
                  { [sequenceField]: { gt: run.position.sequence } },
                  {
                    [sequenceField]: run.position.sequence,
                    integrationId: { gt: run.position.integrationId },
                  },
                ],
              },
            ]
          : []),
      ],
    };
  }

  private studentWhere(
    sourceTenantId: string,
    run: FeedRun,
  ): Prisma.StudentWhereInput {
    return this.courseWhere(sourceTenantId, run) as Prisma.StudentWhereInput;
  }

  private courseOrder(
    mode: AcademicoFeedMode,
  ): Prisma.CourseOrderByWithRelationInput[] {
    return mode === 'full'
      ? [{ integrationCreatedSequence: 'asc' }, { integrationId: 'asc' }]
      : [{ integrationVersion: 'asc' }, { integrationId: 'asc' }];
  }

  private studentOrder(
    mode: AcademicoFeedMode,
  ): Prisma.StudentOrderByWithRelationInput[] {
    return this.courseOrder(mode) as Prisma.StudentOrderByWithRelationInput[];
  }

  private position(
    run: FeedRun,
    row: CourseFeedRow | StudentFeedRow,
  ): { sequence: bigint; integrationId: string } {
    return {
      sequence:
        run.mode === 'full'
          ? row.integrationCreatedSequence
          : row.integrationVersion,
      integrationId: row.integrationId,
    };
  }

  private pageCursor(
    entity: AcademicoEntity,
    sourceTenantId: string,
    run: FeedRun,
    position: { sequence: bigint; integrationId: string },
  ): PageCursor {
    return {
      kind: 'page',
      schemaVersion: ACADEMICO_SCHEMA_VERSION,
      sourceTenantId,
      entity,
      mode: run.mode,
      runId: run.runId,
      capturedAt: run.capturedAt,
      lowerExclusive: run.lowerExclusive.toString(),
      upperExclusive: run.upperExclusive.toString(),
      position: {
        sequence: position.sequence.toString(),
        integrationId: position.integrationId,
      },
    };
  }

  private mode(value: string | undefined): AcademicoFeedMode {
    const mode = value ?? 'incremental';
    if (mode !== 'full' && mode !== 'incremental') {
      throw integrationHttpException(
        HttpStatus.BAD_REQUEST,
        'UNSUPPORTED_INTEGRATION_MODE',
        'Unsupported integration feed mode',
      );
    }
    return mode;
  }

  private assertSchemaVersion(value: string | undefined): void {
    if (value !== undefined && value !== ACADEMICO_SCHEMA_VERSION) {
      throw integrationHttpException(
        HttpStatus.BAD_REQUEST,
        'UNSUPPORTED_SCHEMA_VERSION',
        'Unsupported integration schema version',
      );
    }
  }

  private pageSize(value: string | undefined): number {
    const parsed =
      value === undefined ? ACADEMICO_DEFAULT_PAGE_SIZE : Number(value);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 1 ||
      parsed > ACADEMICO_MAX_PAGE_SIZE
    ) {
      throw integrationHttpException(
        HttpStatus.BAD_REQUEST,
        'INVALID_PAGE_SIZE',
        `Page size must be between 1 and ${ACADEMICO_MAX_PAGE_SIZE}`,
      );
    }
    return parsed;
  }

  private decodePageCursor(value: string): PageCursor {
    try {
      const cursor = this.tokens.decode<PageCursor>(value);
      if (
        cursor.kind !== 'page' ||
        !cursor.position ||
        typeof cursor.position.integrationId !== 'string'
      ) {
        throw new InvalidAcademicoTokenError();
      }
      return cursor;
    } catch {
      throw integrationHttpException(
        HttpStatus.BAD_REQUEST,
        'INVALID_CURSOR',
        'Invalid integration continuation cursor',
      );
    }
  }

  private decodeSnapshot(value: string): SnapshotToken {
    try {
      const snapshot = this.tokens.decode<SnapshotToken>(value);
      if (snapshot.kind !== 'snapshot') throw new InvalidAcademicoTokenError();
      return snapshot;
    } catch {
      throw integrationHttpException(
        HttpStatus.BAD_REQUEST,
        'INVALID_SNAPSHOT',
        'Invalid full snapshot token',
      );
    }
  }

  private resolveWatermark(
    value: string,
    entity: AcademicoEntity,
    sourceTenantId: string,
  ): bigint {
    try {
      const watermark = this.tokens.decode<PersistedWatermark>(value);
      if (
        watermark.kind !== 'watermark' ||
        watermark.schemaVersion !== ACADEMICO_SCHEMA_VERSION ||
        watermark.entity !== entity ||
        watermark.sourceTenantId !== sourceTenantId
      ) {
        throw new InvalidAcademicoTokenError();
      }
      return this.sequence(watermark.sequence, 'INVALID_WATERMARK');
    } catch {
      throw integrationHttpException(
        HttpStatus.BAD_REQUEST,
        'INVALID_WATERMARK',
        'Invalid integration watermark',
      );
    }
  }

  private assertCursorScope(
    cursor: PageCursor,
    entity: AcademicoEntity,
    sourceTenantId: string,
    requestedMode: string | undefined,
  ): void {
    if (
      cursor.schemaVersion !== ACADEMICO_SCHEMA_VERSION ||
      cursor.entity !== entity ||
      cursor.sourceTenantId !== sourceTenantId ||
      (requestedMode !== undefined && requestedMode !== cursor.mode)
    ) {
      throw integrationHttpException(
        HttpStatus.BAD_REQUEST,
        'INVALID_CURSOR',
        'Continuation cursor does not match this feed request',
      );
    }
  }

  private assertSnapshotScope(
    snapshot: SnapshotToken,
    sourceTenantId: string,
  ): void {
    if (
      snapshot.schemaVersion !== ACADEMICO_SCHEMA_VERSION ||
      snapshot.sourceTenantId !== sourceTenantId
    ) {
      throw integrationHttpException(
        HttpStatus.BAD_REQUEST,
        'INVALID_SNAPSHOT',
        'Full snapshot token does not match this tenant',
      );
    }
  }

  private sequence(value: string, errorCode: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw integrationHttpException(
        HttpStatus.BAD_REQUEST,
        errorCode,
        'Invalid integration source position',
      );
    }
    return BigInt(value);
  }

  private async captureBoundary(): Promise<{
    sequence: bigint;
    capturedAt: string;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ sequence: bigint; capturedAt: Date }>
    >(Prisma.sql`
      SELECT
        nextval('integration_change_sequence') AS "sequence",
        CURRENT_TIMESTAMP AS "capturedAt"
    `);
    const boundary = rows[0];
    if (!boundary) throw new Error('Unable to capture integration boundary');
    return {
      sequence: BigInt(boundary.sequence),
      capturedAt: new Date(boundary.capturedAt).toISOString(),
    };
  }
}
