import { AcademicFinancialProjectionService } from './academic-financial-projection.service';

const tenant = 'local-tenant-a';
const canonical = '11111111-1111-4111-8111-111111111111';
const enrollment = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const event = (version = 8, overrides: Record<string, unknown> = {}) => ({
  eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  eventType: 'academic.financial-projection.enrollment.upserted.v2',
  schemaVersion: '2',
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
    // Synthetic data only; the RUN is a sequential test value.
    student: {
      firstName: 'Alumna',
      lastName: 'Sintética',
      nationalIdType: 'RUN',
      nationalId: '111111111',
      legacyIntegrationId: '0f0f0f0f-0f0f-40f0-80f0-0f0f0f0f0f0f',
    },
    course: {
      label: '1° Básico A',
      legacyIntegrationId: '0e0e0e0e-0e0e-40e0-80e0-0e0e0e0e0e0e',
    },
    academicYear: {
      label: '2027',
      startDate: '2027-03-01',
      endDate: '2027-12-15',
      status: 'DRAFT',
    },
  },
  ...overrides,
});

const withPayload = (changes: Record<string, unknown>) => {
  const base = event();
  return { ...base, payload: { ...base.payload, ...changes } };
};

describe('AcademicFinancialProjectionService', () => {
  const consumedFind = jest.fn();
  const mappingFind = jest.fn();
  const projectionFind = jest.fn();
  const projectionUpsert = jest.fn();
  const consumedCreate = jest.fn();
  const quarantineCreate = jest.fn();
  const financialWrite = jest.fn();
  const financialModels = {
    charge: {
      create: financialWrite,
      update: financialWrite,
      upsert: financialWrite,
      delete: financialWrite,
    },
    payment: {
      create: financialWrite,
      update: financialWrite,
      upsert: financialWrite,
      delete: financialWrite,
    },
    student: {
      create: financialWrite,
      update: financialWrite,
      upsert: financialWrite,
      delete: financialWrite,
    },
    course: {
      create: financialWrite,
      update: financialWrite,
      upsert: financialWrite,
      delete: financialWrite,
    },
  };
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
    ...financialModels,
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
    ...financialModels,
  };
  const config = {
    enabled: jest.fn(() => true),
    writeEnabled: jest.fn(() => false),
    requireInboundCredentials: jest.fn(),
  };
  const writer = {
    writeAndMark: jest.fn(async () => ({
      academicEnrollmentId: enrollment,
      outcome: 'APPLIED',
      changes: [],
    })),
  };
  const service = new AcademicFinancialProjectionService(
    prisma as never,
    config as never,
    writer as never,
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
    const created = projectionUpsert.mock.calls[0]![0].create;
    expect(created).toMatchObject({
      studentFirstName: 'Alumna',
      studentLastName: 'Sintética',
      studentNationalIdType: 'RUN',
      studentNationalId: '111111111',
      studentLegacyIntegrationId: '0f0f0f0f-0f0f-40f0-80f0-0f0f0f0f0f0f',
      courseLabel: '1° Básico A',
      courseLegacyIntegrationId: '0e0e0e0e-0e0e-40e0-80e0-0e0e0e0e0e0e',
      academicYearLabel: '2027',
      academicYearStartDate: new Date('2027-03-01T00:00:00.000Z'),
      academicYearEndDate: new Date('2027-12-15T00:00:00.000Z'),
      academicYearStatus: 'DRAFT',
    });
    expect(Object.keys(created).join(',')).not.toMatch(
      /email|guardian|payment|charge|rut/i,
    );
  });

  it('writes into BL tables in the same transaction only with write mode on', async () => {
    const row = { id: 'shadow-row', academicEnrollmentId: enrollment };
    projectionUpsert.mockResolvedValue(row);

    await service.consume(event(), canonical);
    expect(writer.writeAndMark).not.toHaveBeenCalled();

    config.writeEnabled.mockReturnValueOnce(true);
    consumedFind.mockResolvedValue(null);
    await expect(service.consume(event(), canonical)).resolves.toEqual({
      outcome: 'APPLIED',
    });
    expect(writer.writeAndMark).toHaveBeenCalledWith(tx, tenant, row);
  });

  it('quarantines a v1 event: v1 was never activated', async () => {
    const legacy = event();
    await expect(
      service.consume(
        {
          ...legacy,
          eventType: 'academic.financial-projection.enrollment.upserted.v1',
          schemaVersion: '1',
        },
        canonical,
      ),
    ).resolves.toEqual({
      outcome: 'QUARANTINED',
      reasonCode: 'INVALID_CONTRACT',
    });
    expect(projectionUpsert).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a RUN type without its value',
      { student: { ...event().payload.student, nationalId: null } },
    ],
    [
      'an unexpected student field',
      { student: { ...event().payload.student, email: 'x@example.test' } },
    ],
    [
      'a formatted RUN instead of the canonical value',
      { student: { ...event().payload.student, nationalId: '11.111.111-1' } },
    ],
    ['a missing course descriptor', { course: undefined }],
    [
      'an impossible year date',
      {
        academicYear: {
          ...event().payload.academicYear,
          endDate: '2027-02-30',
        },
      },
    ],
    [
      'an unknown year status',
      { academicYear: { ...event().payload.academicYear, status: 'OPEN' } },
    ],
  ])(
    'quarantines %s without touching the projection',
    async (_case, changes) => {
      const payload = { ...event().payload, ...changes } as Record<
        string,
        unknown
      >;
      if (payload.course === undefined) delete payload.course;
      await expect(
        service.consume({ ...event(), payload }, canonical),
      ).resolves.toEqual({
        outcome: 'QUARANTINED',
        reasonCode: 'INVALID_CONTRACT',
      });
      expect(projectionUpsert).not.toHaveBeenCalled();
    },
  );

  it('accepts a manual student with IPE and no legacy reference', async () => {
    await expect(
      service.consume(
        withPayload({
          student: {
            firstName: 'Alumno',
            lastName: 'Nuevo',
            nationalIdType: 'IPE',
            nationalId: '100200300',
            legacyIntegrationId: null,
          },
          course: { label: '1° Básico B', legacyIntegrationId: null },
        }),
        canonical,
      ),
    ).resolves.toEqual({ outcome: 'APPLIED' });
    expect(projectionUpsert.mock.calls[0]![0].create).toMatchObject({
      studentNationalIdType: 'IPE',
      studentLegacyIntegrationId: null,
      courseLegacyIntegrationId: null,
    });
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

  it('keeps version 8 when version 7 arrives afterwards', async () => {
    await expect(
      service.consume(
        event(8, { eventId: '12121212-1212-4121-8121-121212121212' }),
        canonical,
      ),
    ).resolves.toEqual({ outcome: 'APPLIED' });
    projectionFind.mockResolvedValueOnce({ id: 'projection-id', version: 8n });
    await expect(
      service.consume(
        event(7, { eventId: '13131313-1313-4131-8131-131313131313' }),
        canonical,
      ),
    ).resolves.toEqual({
      outcome: 'STALE',
      reasonCode: 'ENTITY_VERSION_NOT_NEWER',
    });
    expect(projectionUpsert).toHaveBeenCalledTimes(1);
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
      eventType: 'academic.financial-projection.enrollment.tombstoned.v2',
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

  it('has zero legacy or financial writes when shadow mode is disabled', async () => {
    config.enabled.mockReturnValueOnce(false);
    await expect(service.consume(event(), canonical)).rejects.toMatchObject({
      status: 503,
    });
    expect(projectionUpsert).not.toHaveBeenCalled();
    expect(financialWrite).not.toHaveBeenCalled();
  });

  it('updates only the projection when enabled, never Charge, Payment, Student, or Course', async () => {
    await expect(service.consume(event(), canonical)).resolves.toEqual({
      outcome: 'APPLIED',
    });
    expect(projectionUpsert).toHaveBeenCalledTimes(1);
    expect(financialWrite).not.toHaveBeenCalled();
  });

  it('rejects a validly shaped event from another canonical tenant before any write', async () => {
    await expect(
      service.consume(event(), '22222222-2222-4222-8222-222222222222'),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(projectionUpsert).not.toHaveBeenCalled();
    expect(financialWrite).not.toHaveBeenCalled();
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
