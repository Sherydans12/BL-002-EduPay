import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/** Maximum identifiers listed per category; counts are always complete. */
const SAMPLE_LIMIT = 20;

type Category = { readonly count: number; readonly sample: string[] };

const category = (ids: Iterable<string>): Category => {
  const all = [...ids].sort();
  return { count: all.length, sample: all.slice(0, SAMPLE_LIMIT) };
};

/** BL keeps formatted RUTs; Académico sends canonical RUN without zeros. */
const comparableRun = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value
    .toUpperCase()
    .replace(/[^0-9K]/g, '')
    .replace(/^0+/, '');
  return normalized.length > 0 ? normalized : null;
};

/**
 * Read-only comparison between the v2 shadow projection and the legacy BL
 * roster (ADR-0025 step 3). It links records **only** by the legacy
 * integrationId that Académico carries for EDUPAY-sourced records. RUN is used
 * solely to detect conflicts, never to link. It writes nothing and returns
 * identifiers only: no names or RUN/IPE values.
 */
@Injectable()
export class AcademicFinancialProjectionReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async legacyReconciliation(tenantId: string) {
    const [projections, legacyStudents, legacyCourses] = await Promise.all([
      this.prisma.academicFinancialProjection.findMany({
        where: { tenantId, operation: 'UPSERT' },
        select: {
          academicStudentId: true,
          academicCourseId: true,
          academicYearId: true,
          academicYearLabel: true,
          studentFirstName: true,
          studentNationalIdType: true,
          studentNationalId: true,
          studentLegacyIntegrationId: true,
          courseLegacyIntegrationId: true,
        },
      }),
      this.prisma.student.findMany({
        where: { tenantId, deletedAt: null },
        select: { integrationId: true, rut: true },
      }),
      this.prisma.course.findMany({
        where: { tenantId, deletedAt: null },
        select: { integrationId: true },
      }),
    ]);

    const legacyStudentRun = new Map(
      legacyStudents.map((student) => [
        student.integrationId.toLowerCase(),
        comparableRun(student.rut),
      ]),
    );
    const legacyRuns = new Set(
      [...legacyStudentRun.values()].filter(
        (value): value is string => value !== null,
      ),
    );
    const legacyCourseIds = new Set(
      legacyCourses.map((course) => course.integrationId.toLowerCase()),
    );

    const years = new Map<
      string,
      { label: string | null; activeEnrollments: number }
    >();
    const students = new Map<string, (typeof projections)[number]>();
    const courses = new Map<string, string | null>();
    const missingDescriptors = new Set<string>();
    for (const row of projections) {
      const year = years.get(row.academicYearId) ?? {
        label: row.academicYearLabel,
        activeEnrollments: 0,
      };
      year.activeEnrollments += 1;
      years.set(row.academicYearId, year);
      if (row.studentFirstName === null) {
        missingDescriptors.add(row.academicStudentId);
        continue;
      }
      students.set(row.academicStudentId, row);
      courses.set(
        row.academicCourseId,
        row.courseLegacyIntegrationId?.toLowerCase() ?? null,
      );
    }

    const linked = new Set<string>();
    const runMismatch = new Set<string>();
    const referenceNotFound = new Set<string>();
    const newInAcademico = new Set<string>();
    const runConflict = new Set<string>();
    const referencedLegacy = new Map<string, string[]>();
    for (const [academicStudentId, row] of students) {
      const legacyId = row.studentLegacyIntegrationId?.toLowerCase() ?? null;
      const run =
        row.studentNationalIdType === 'RUN'
          ? comparableRun(row.studentNationalId)
          : null;
      if (legacyId === null) {
        newInAcademico.add(academicStudentId);
        if (run !== null && legacyRuns.has(run))
          runConflict.add(academicStudentId);
        continue;
      }
      if (!legacyStudentRun.has(legacyId)) {
        referenceNotFound.add(academicStudentId);
        continue;
      }
      linked.add(academicStudentId);
      referencedLegacy.set(legacyId, [
        ...(referencedLegacy.get(legacyId) ?? []),
        academicStudentId,
      ]);
      const legacyRun = legacyStudentRun.get(legacyId) ?? null;
      if (run !== null && legacyRun !== null && run !== legacyRun)
        runMismatch.add(academicStudentId);
    }
    const duplicateReference = new Set(
      [...referencedLegacy.values()].filter((ids) => ids.length > 1).flat(),
    );
    const studentsOnlyInBl = [...legacyStudentRun.keys()].filter(
      (id) => !referencedLegacy.has(id),
    );

    const coursesLinked = new Set<string>();
    const courseReferenceNotFound = new Set<string>();
    const coursesNew = new Set<string>();
    const referencedCourses = new Set<string>();
    for (const [academicCourseId, legacyId] of courses) {
      if (legacyId === null) coursesNew.add(academicCourseId);
      else if (!legacyCourseIds.has(legacyId))
        courseReferenceNotFound.add(academicCourseId);
      else {
        coursesLinked.add(academicCourseId);
        referencedCourses.add(legacyId);
      }
    }
    const coursesOnlyInBl = [...legacyCourseIds].filter(
      (id) => !referencedCourses.has(id),
    );

    const report = {
      tenantId,
      linkingRule:
        'Records are linked only by the legacy integrationId. RUN is used only to detect conflicts. No name, label or email matching is performed.',
      academicYears: [...years.entries()]
        .map(([academicYearId, year]) => ({ academicYearId, ...year }))
        .sort((left, right) =>
          (left.label ?? '').localeCompare(right.label ?? ''),
        ),
      students: {
        academico: students.size + missingDescriptors.size,
        legacyBl: legacyStudents.length,
        linked: category(linked),
        newInAcademico: category(newInAcademico),
        legacyReferenceNotFound: category(referenceNotFound),
        duplicateLegacyReference: category(duplicateReference),
        runMismatch: category(runMismatch),
        runConflictWithLegacy: category(runConflict),
        missingDescriptors: category(missingDescriptors),
        onlyInLegacyBl: category(studentsOnlyInBl),
      },
      courses: {
        academico: courses.size,
        legacyBl: legacyCourses.length,
        linked: category(coursesLinked),
        newInAcademico: category(coursesNew),
        legacyReferenceNotFound: category(courseReferenceNotFound),
        onlyInLegacyBl: category(coursesOnlyInBl),
      },
    };
    const blocking = [
      ['students.legacyReferenceNotFound', referenceNotFound.size],
      ['students.duplicateLegacyReference', duplicateReference.size],
      ['students.runMismatch', runMismatch.size],
      ['students.runConflictWithLegacy', runConflict.size],
      ['students.missingDescriptors', missingDescriptors.size],
      ['courses.legacyReferenceNotFound', courseReferenceNotFound.size],
    ]
      .filter(([, count]) => (count as number) > 0)
      .map(([name]) => name as string);
    const requiresDecision = [
      ['students.onlyInLegacyBl', studentsOnlyInBl.length],
      ['courses.onlyInLegacyBl', coursesOnlyInBl.length],
    ]
      .filter(([, count]) => (count as number) > 0)
      .map(([name]) => name as string);
    return {
      ...report,
      blocking,
      requiresDecision,
      readyForWriteMode: blocking.length === 0 && requiresDecision.length === 0,
    };
  }
}
