import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { tenantContext } from '../core/tenant/tenant.context';
import { PrismaService } from '../prisma/prisma.service';

export const MANAGED_BY_ACADEMICO = 'MANAGED_BY_ACADEMICO';

/** Same fallback as the schema default and CoursesService for tenantless users. */
const DEFAULT_TENANT_ID = 'colegio-conquistadores';

export type AcademicRecord = 'students' | 'courses';

const MESSAGES: Record<AcademicRecord, string> = {
  students:
    'Los alumnos se crean y editan en EduPay Académico. En Pagos solo se gestionan apoderado y datos financieros.',
  courses: 'Los cursos se crean y editan en EduPay Académico.',
};

/** Student fields owned by Académico once it is the authority (ADR-0028). */
export const ACADEMIC_STUDENT_FIELDS = [
  'rut',
  'firstName',
  'lastName',
  'name',
  'courseId',
  'status',
] as const;

/**
 * ADR-0028: for a tenant mapped to Académico with projection write mode on,
 * students, courses and years come only from Académico. Tenants without that
 * mapping keep managing them in BL.
 */
@Injectable()
export class AcademicAuthorityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async managedByAcademico(
    tenantId = this.currentTenantId(),
  ): Promise<boolean> {
    if (!tenantId || !this.writeModeEnabled()) return false;
    const mapping = await this.prisma.tenantCanonicalMapping.findUnique({
      where: { tenantId },
      select: { tenantId: true },
    });
    return Boolean(mapping);
  }

  async assertManagedLocally(record: AcademicRecord): Promise<void> {
    if (await this.managedByAcademico()) this.reject(record);
  }

  /** Allows financial edits (guardian) but not Académico's student fields. */
  async assertStudentUpdateAllowed(dto: object): Promise<void> {
    const academicFields = ACADEMIC_STUDENT_FIELDS.filter(
      (field) => (dto as Record<string, unknown>)[field] !== undefined,
    );
    if (academicFields.length === 0) return;
    if (await this.managedByAcademico()) this.reject('students');
  }

  private reject(record: AcademicRecord): never {
    throw new ConflictException({
      statusCode: 409,
      code: MANAGED_BY_ACADEMICO,
      message: MESSAGES[record],
    });
  }

  private writeModeEnabled(): boolean {
    return (
      this.config.get<string>('ACADEMIC_FINANCIAL_PROJECTION_ENABLED') ===
        'true' &&
      this.config.get<string>('ACADEMIC_FINANCIAL_PROJECTION_WRITE_ENABLED') ===
        'true'
    );
  }

  private currentTenantId(): string | undefined {
    return tenantContext.getStore()?.tenantId ?? DEFAULT_TENANT_ID;
  }
}
