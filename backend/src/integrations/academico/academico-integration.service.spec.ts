import { AcademicoIntegrationService } from './academico-integration.service';
import { AcademicoTokenCodecService } from './academico-token-codec.service';
import { AcademicoIntegrationConfigService } from './academico-integration-config.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AcademicoIntegrationService', () => {
  const capturedAt = new Date('2026-08-11T12:00:00.000Z');
  const courseFindMany = jest.fn();
  const studentFindMany = jest.fn();
  const queryRaw = jest
    .fn()
    .mockResolvedValue([{ sequence: 100n, capturedAt }]);
  const prisma = {
    course: { findMany: courseFindMany },
    student: { findMany: studentFindMany },
    $queryRaw: queryRaw,
  } as unknown as PrismaService;
  const tokenCodec = new AcademicoTokenCodecService({
    cursorSecret: () => 'unit-test-cursor-secret-at-least-32-characters',
  } as AcademicoIntegrationConfigService);
  const service = new AcademicoIntegrationService(prisma, tokenCodec);

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([{ sequence: 100n, capturedAt }]);
  });

  it('returns an exact sparse Course item and an opaque terminal watermark', async () => {
    courseFindMany.mockResolvedValue([
      {
        integrationId: '11111111-1111-4111-8111-111111111111',
        integrationCreatedSequence: 1n,
        integrationVersion: 10n,
        name: '  Primero A  ',
        updatedAt: capturedAt,
        deletedAt: null,
      },
    ]);

    const result = await service.courses('tenant-a', {});

    expect(result).toMatchObject({
      schemaVersion: '1',
      sourceTenantId: 'tenant-a',
      entity: 'COURSE',
      mode: 'incremental',
      items: [
        {
          integrationId: '11111111-1111-4111-8111-111111111111',
          sourceTenantId: 'tenant-a',
          name: 'Primero A',
          updatedAt: capturedAt.toISOString(),
          deletedAt: null,
        },
      ],
      conflicts: [],
      page: { complete: true, scannedCount: 1, itemCount: 1 },
      watermark: { available: true },
    });
    expect(Object.keys(result.items[0]).sort()).toEqual(
      [
        'integrationId',
        'sourceTenantId',
        'name',
        'updatedAt',
        'deletedAt',
      ].sort(),
    );
    expect(result.watermark.next).toEqual(expect.any(String));
    expect(courseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' }),
        take: 101,
      }),
    );
  });

  it('quarantines a Student with incomplete structured names without leaking source data', async () => {
    studentFindMany.mockResolvedValue([
      {
        integrationId: '22222222-2222-4222-8222-222222222222',
        integrationCreatedSequence: 2n,
        integrationVersion: 20n,
        firstName: null,
        lastName: 'Apellido',
        status: 'ACTIVE',
        updatedAt: capturedAt,
        deletedAt: null,
        course: {
          integrationId: '33333333-3333-4333-8333-333333333333',
        },
      },
    ]);

    const result = await service.students('tenant-a', {});

    expect(result.items).toEqual([]);
    expect(result.conflicts).toEqual([
      {
        code: 'STUDENT_STRUCTURED_NAME_MISSING',
        entity: 'STUDENT',
        integrationId: '22222222-2222-4222-8222-222222222222',
        sourceTenantId: 'tenant-a',
        updatedAt: capturedAt.toISOString(),
        deletedAt: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /rut|guardian|payment|financial/i,
    );
  });

  it('replays a continuation cursor with the same bounded query and response', async () => {
    const firstRow = {
      integrationId: '44444444-4444-4444-8444-444444444444',
      integrationCreatedSequence: 4n,
      integrationVersion: 40n,
      name: 'Course 1',
      updatedAt: capturedAt,
      deletedAt: null,
    };
    const secondRow = {
      integrationId: '55555555-5555-4555-8555-555555555555',
      integrationCreatedSequence: 5n,
      integrationVersion: 50n,
      name: 'Course 2',
      updatedAt: capturedAt,
      deletedAt: null,
    };
    courseFindMany.mockResolvedValueOnce([firstRow, secondRow]);
    const first = await service.courses('tenant-a', { limit: '1' });
    expect(first.page.nextCursor).toEqual(expect.any(String));

    courseFindMany.mockResolvedValue([secondRow]);
    const continuation = await service.courses('tenant-a', {
      limit: '1',
      cursor: first.page.nextCursor!,
    });
    const replay = await service.courses('tenant-a', {
      limit: '1',
      cursor: first.page.nextCursor!,
    });

    expect(replay).toEqual(continuation);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(courseFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a' }),
        take: 2,
      }),
    );
  });

  it('rejects an unbounded page before querying source rows', async () => {
    await expect(
      service.courses('tenant-a', { limit: '501' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_PAGE_SIZE' }),
    });
    expect(courseFindMany).not.toHaveBeenCalled();
  });
});
