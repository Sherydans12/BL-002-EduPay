import { PrismaClient } from '@prisma/client';
import {
  parseStudentRoster,
  ConfidenceClass,
  StudentParseOutput,
} from '../src/students/student-name-parser';

interface ScriptOptions {
  readonly mode: 'dry-run' | 'apply';
  readonly tenantId: string;
}

function parseArgs(args: readonly string[]): ScriptOptions {
  let mode: 'dry-run' | 'apply' = 'dry-run';
  let tenantId = 'colegio-conquistadores';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') {
      mode = 'apply';
    } else if (arg === '--dry-run') {
      mode = 'dry-run';
    } else if (arg === '--tenant' && args[i + 1]) {
      tenantId = args[i + 1];
      i++;
    }
  }

  return { mode, tenantId };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const students = await prisma.student.findMany({
      where: {
        tenantId: options.tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
      },
      orderBy: { id: 'asc' },
    });

    const parseOutputs = parseStudentRoster(students);

    // Compute histogram and metrics
    const tokenHistogram: Record<number, number> = {};
    const confidenceCounts: Record<ConfidenceClass, number> = {
      HIGH_CONFIDENCE: 0,
      CORPUS_RESOLVED: 0,
      UNRESOLVED_AMBIGUOUS: 0,
      UNRESOLVED_SINGLE_TOKEN: 0,
      ALREADY_STRUCTURED: 0,
      INVALID_SOURCE: 0,
    };

    let invariantFailures = 0;
    const applicableRecords: StudentParseOutput[] = [];

    for (const output of parseOutputs) {
      tokenHistogram[output.tokenCount] =
        (tokenHistogram[output.tokenCount] ?? 0) + 1;
      confidenceCounts[output.confidence] += 1;

      if (
        output.confidence === 'HIGH_CONFIDENCE' ||
        output.confidence === 'CORPUS_RESOLVED'
      ) {
        // Validate invariants
        if (!output.firstName || output.firstName.trim().length === 0) {
          invariantFailures++;
        }
        if (!output.lastName || output.lastName.trim().length === 0) {
          invariantFailures++;
        }

        const combined = `${output.lastName} ${output.firstName}`
          .split(' ')
          .filter(Boolean)
          .sort()
          .join(' ');
        const orig = output.normalizedName
          .split(' ')
          .filter(Boolean)
          .sort()
          .join(' ');

        if (combined !== orig) {
          invariantFailures++;
        }

        applicableRecords.push(output);
      }
    }

    const predictedIntegrationReady = applicableRecords.length;
    const predictedRemainingConflict =
      students.length - predictedIntegrationReady;

    const aggregateReport = {
      action: 'STUDENT_STRUCTURED_NAME_BACKFILL',
      mode: options.mode,
      tenantId: options.tenantId,
      totalEligible: students.length,
      tokenHistogram,
      confidenceCounts,
      invariantFailures,
      invariantsPass: invariantFailures === 0,
      predictedIntegrationReady,
      predictedRemainingConflict,
    };

    if (invariantFailures > 0) {
      console.error(
        JSON.stringify({
          ...aggregateReport,
          error: 'INVARIANT_FAILURE',
          message: `${invariantFailures} records failed strict parser invariants.`,
        }),
      );
      process.exitCode = 1;
      return;
    }

    if (options.mode === 'dry-run') {
      console.log(JSON.stringify(aggregateReport, null, 2));
      return;
    }

    // APPLY MODE
    let appliedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const record of applicableRecords) {
        await tx.student.update({
          where: { id: record.id },
          data: {
            firstName: record.firstName,
            lastName: record.lastName,
            // legacy 'name' intentionally omitted to preserve original source text
          },
        });
        appliedCount++;
      }
    });

    console.log(
      JSON.stringify(
        {
          ...aggregateReport,
          appliedCount,
          status: 'COMPLETED',
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exitCode = 1;
});
