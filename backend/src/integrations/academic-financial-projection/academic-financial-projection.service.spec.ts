import { AcademicFinancialProjectionService } from './academic-financial-projection.service';

const tenant = 'local-tenant-a';
const canonical = '11111111-1111-4111-8111-111111111111';
const enrollment = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const event = (version = 8, overrides: Record<string, unknown> = {}) => ({
  eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  eventType: 'academic.financial-projection.enrollment.upserted.v1',
  schemaVersion: '1',
  canonicalTenantId: canonical,
  aggregateType: 'ACADEMIC_ENROLLMENT',
  aggregateId: enrollment,
  entityVersion: version,
  occurredAt: '2026-09-03T12:00:00.000Z',
  correlationId: 'shadow-test',
  payload: {
    canonicalTenantId: canonical,
    academicYearId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    academicStudentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    academicCourseId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    academicEnrollmentId: enrollment,
    enrollmentStatus: 'ACTIVE',
    effectiveFrom: '2026-03-01T00:00:00.000Z',
    effectiveTo: null,
    version,
    updatedAt: '2026-09-03T12:00:00.000Z',
    operation: 'UPSERT',
  },
  ...overrides,
});

describe('AcademicFinancialProjectionService', () => {
  const consumedFind = jest.fn();
  const mappingFind = jest.fn();
  const projectionFind = jest.fn();
  const projectionUpsert = jest.fn();
  const consumedCreate = jest.fn();
  const quarantineCreate = jest.fn();
  const tx = {
    academicFinancialProjectionConsumedEvent: {
      findUnique: consumedFind,
      create: consumedCreate,
    },
    tenantCanonicalMapping: { findUnique: mappingFind },
    academicFinancialProjection: {
      findUnique: projectionFind,
      upsert: projectionUpsert,
      update: jest.fn(),
    },
    academicFinancialProjectionQuarantine: { create: quarantineCreate },
  };
  const prisma = {
    $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
      operation(tx),
    ),
    academicFinancialProjectionQuarantine: { create: quarantineCreate },
    academicFinancialProjectionSnapshot: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    academicFinancialProjection: {
      findUnique: projectionFind,
      upsert: projectionUpsert,
      update: jest.fn(),
      count: jest.fn(),
    },
  };
  const config = {
    enabled: jest.fn(() => true),
    requireInboundCredentials: jest.fn(),
  };
  const service = new AcademicFinancialProjectionService(
    prisma as never,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    consumedFind.mockResolvedValue(null);
    mappingFind.mockResolvedValue({ tenantId: tenant });
    projectionFind.mockResolvedValue(null);
    projectionUpsert.mockResolvedValue({});
    consumedCreate.mockResolvedValue({});
    quarantineCreate.mockResolvedValue({});
  });

  it('applies the first event using only the canonical mapping', async () => {
    await expect(service.consume(event(), canonical)).resolves.toEqual({
      outcome: 'APPLIED',
    });
    expect(mappingFind).toHaveBeenCalledWith({
      where: { canonicalTenantId: canonical },
      select: { tenantId: true },
    });
    expect(projectionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_academicEnrollmentId: {
            tenantId: tenant,
            academicEnrollmentId: enrollment,
          },
        },
      }),
    );
    expect(
      Object.keys(projectionUpsert.mock.calls[0]![0].create).join(','),
    ).not.toMatch(/name|rut|email|payment/i);
  });

  it('does not apply a duplicate event or overwrite a stale version', async () => {
    consumedFind.mockResolvedValueOnce({ outcome: 'APPLIED' });
    await expect(service.consume(event(), canonical)).resolves.toEqual({
      outcome: 'DUPLICATE',
    });
    expect(projectionUpsert).not.toHaveBeenCalled();

    consumedFind.mockResolvedValueOnce(null);
    projectionFind.mockResolvedValueOnce({ id: 'projection-id', version: 9n });
    await expect(
      service.consume(
        event(8, { eventId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }),
        canonical,
      ),
    ).resolves.toEqual({
      outcome: 'STALE',
      reasonCode: 'ENTITY_VERSION_NOT_NEWER',
    });
    expect(projectionUpsert).not.toHaveBeenCalled();
  });

  it('quarantines an event when the explicit canonical mapping is absent', async () => {
    mappingFind.mockResolvedValueOnce(null);
    await expect(service.consume(event(), canonical)).resolves.toEqual({
      outcome: 'QUARANTINED',
      reasonCode: 'CANONICAL_TENANT_MAPPING_MISSING',
    });
    expect(quarantineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reasonCode: 'CANONICAL_TENANT_MAPPING_MISSING',
        }),
      }),
    );
    expect(projectionUpsert).not.toHaveBeenCalled();
  });

  it('accepts a logical tombstone and never deletes a financial record', async () => {
    const tombstone = event(10, {
      eventId: '99999999-9999-4999-8999-999999999999',
      eventType: 'academic.financial-projection.enrollment.tombstoned.v1',
      payload: {
        ...event(10).payload,
        enrollmentStatus: 'INACTIVE',
        effectiveTo: '2026-09-03T12:00:00.000Z',
        operation: 'TOMBSTONE',
      },
    });
    await expect(service.consume(tombstone, canonical)).resolves.toEqual({
      outcome: 'APPLIED',
    });
    expect(projectionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          operation: 'TOMBSTONE',
          version: 10n,
        }),
      }),
    );
  });

  it('quarantines unknown event types before they can reach the projection', async () => {
    await expect(
      service.consume({ ...event(), eventType: 'unknown.v1' }, canonical),
    ).resolves.toEqual({
      outcome: 'QUARANTINED',
      reasonCode: 'INVALID_CONTRACT',
    });
    expect(projectionUpsert).not.toHaveBeenCalled();
  });

  it('fails closed when shadow mode is disabled', async () => {
    config.enabled.mockReturnValueOnce(false);
    await expect(service.consume(event(), canonical)).rejects.toMatchObject({
      status: 503,
    });
    expect(projectionUpsert).not.toHaveBeenCalled();
  });

  it('does not reconcile a partial snapshot and reconciles a complete one only after counts match', async () => {
    const snapshotFind = prisma.academicFinancialProjectionSnapshot.findFirst;
    snapshotFind.mockResolvedValueOnce({
      id: 'snapshot',
      tenantId: tenant,
      canonicalTenantId: canonical,
      status: 'INCOMPLETE',
    });
    await expect(
      service.reconcileSnapshot(tenant, 'snapshot'),
    ).rejects.toMatchObject({ status: 400 });

    snapshotFind.mockResolvedValueOnce({
      id: 'snapshot',
      tenantId: tenant,
      canonicalTenantId: canonical,
      status: 'COMPLETE',
      expectedItemCount: 2,
      receivedItemCount: 2,
    });
    prisma.academicFinancialProjection.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    const report = await service.reconcileSnapshot(tenant, 'snapshot');
    expect(report).toMatchObject({ missing: 0, extra: 0, reconciled: true });
    expect(
      prisma.academicFinancialProjectionSnapshot.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RECONCILED' }),
      }),
    );
  });
});
