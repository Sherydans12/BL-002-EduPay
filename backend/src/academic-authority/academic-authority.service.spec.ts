import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { tenantContext } from '../core/tenant/tenant.context';
import { PrismaService } from '../prisma/prisma.service';
import {
  AcademicAuthorityService,
  MANAGED_BY_ACADEMICO,
} from './academic-authority.service';

function serviceWith(options: {
  enabled?: string;
  write?: string;
  mapped?: boolean;
}) {
  const prisma = {
    tenantCanonicalMapping: {
      findUnique: jest
        .fn()
        .mockResolvedValue(options.mapped ? { tenantId: 'tenant-a' } : null),
    },
  };
  const values: Record<string, string | undefined> = {
    ACADEMIC_FINANCIAL_PROJECTION_ENABLED: options.enabled,
    ACADEMIC_FINANCIAL_PROJECTION_WRITE_ENABLED: options.write,
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  return {
    prisma,
    service: new AcademicAuthorityService(
      prisma as unknown as PrismaService,
      config,
    ),
  };
}

function inTenant<T>(run: () => Promise<T>): Promise<T> {
  return tenantContext.run({ tenantId: 'tenant-a' } as never, run);
}

describe('AcademicAuthorityService (ADR-0028)', () => {
  it('manages a mapped tenant from Académico only with write mode on', async () => {
    const on = serviceWith({ enabled: 'true', write: 'true', mapped: true });
    await expect(inTenant(() => on.service.managedByAcademico())).resolves.toBe(
      true,
    );
    expect(on.prisma.tenantCanonicalMapping.findUnique).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      select: { tenantId: true },
    });

    for (const options of [
      { enabled: 'true', write: 'false', mapped: true },
      { enabled: 'false', write: 'true', mapped: true },
      { enabled: 'true', write: 'true', mapped: false },
    ]) {
      const { service } = serviceWith(options);
      await expect(inTenant(() => service.managedByAcademico())).resolves.toBe(
        false,
      );
    }
    const tenantless = serviceWith({
      enabled: 'true',
      write: 'true',
      mapped: true,
    });
    await expect(tenantless.service.managedByAcademico()).resolves.toBe(true);
    expect(
      tenantless.prisma.tenantCanonicalMapping.findUnique,
    ).toHaveBeenCalledWith({
      where: { tenantId: 'colegio-conquistadores' },
      select: { tenantId: true },
    });
  });

  it('rejects academic writes with a stable code and keeps local tenants open', async () => {
    const managed = serviceWith({
      enabled: 'true',
      write: 'true',
      mapped: true,
    });
    await expect(
      inTenant(() => managed.service.assertManagedLocally('courses')),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      inTenant(() => managed.service.assertManagedLocally('students')),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: MANAGED_BY_ACADEMICO }),
    });

    const local = serviceWith({
      enabled: 'true',
      write: 'true',
      mapped: false,
    });
    await expect(
      inTenant(() => local.service.assertManagedLocally('students')),
    ).resolves.toBeUndefined();
  });

  it('allows guardian changes but not Académico student fields', async () => {
    const managed = serviceWith({
      enabled: 'true',
      write: 'true',
      mapped: true,
    });
    await expect(
      inTenant(() =>
        managed.service.assertStudentUpdateAllowed({ guardianId: 7 }),
      ),
    ).resolves.toBeUndefined();
    expect(
      managed.prisma.tenantCanonicalMapping.findUnique,
    ).not.toHaveBeenCalled();
    for (const field of [
      'rut',
      'firstName',
      'lastName',
      'name',
      'courseId',
      'status',
    ]) {
      await expect(
        inTenant(() =>
          managed.service.assertStudentUpdateAllowed({
            guardianId: 7,
            [field]: field === 'courseId' ? 2 : 'x',
          }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    }
  });
});
