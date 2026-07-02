import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ChargeStatus,
  FinancialSetupStatus,
  Prisma,
  PrismaClient,
  StudentStatus,
} from '@prisma/client';
import { Pool } from 'pg';

const DEMO_TENANT_ID = 'colegio-pruebas';
const SEED_MARKER = 'DEMO_TENANT_SEED';

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada');
  }

  const pool = new Pool({ connectionString });
  return new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ['error'],
  });
}

const prisma = createPrisma();

async function ensurePendingCharge(
  tx: Prisma.TransactionClient,
  data: {
    studentId: number;
    conceptId: number;
    amount: number;
    dueDate: Date;
    notes: string;
  },
) {
  const existing = await tx.charge.findFirst({
    where: {
      tenantId: DEMO_TENANT_ID,
      studentId: data.studentId,
      conceptId: data.conceptId,
      dueDate: data.dueDate,
      notes: data.notes,
    },
  });

  const chargeData = {
    tenantId: DEMO_TENANT_ID,
    studentId: data.studentId,
    conceptId: data.conceptId,
    amount: data.amount,
    paidAmount: 0,
    dueDate: data.dueDate,
    status: ChargeStatus.PENDING,
    notes: data.notes,
    deletedAt: null,
  };

  if (existing) {
    return tx.charge.update({
      where: { id: existing.id },
      data: chargeData,
    });
  }

  return tx.charge.create({
    data: chargeData,
  });
}

async function main(): Promise<void> {
  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.upsert({
      where: { id: DEMO_TENANT_ID },
      update: {
        name: 'Colegio de Pruebas',
        slug: DEMO_TENANT_ID,
        isActive: true,
      },
      create: {
        id: DEMO_TENANT_ID,
        name: 'Colegio de Pruebas',
        slug: DEMO_TENANT_ID,
        isActive: true,
      },
    });

    const course = await tx.course.upsert({
      where: {
        tenantId_name: {
          tenantId: DEMO_TENANT_ID,
          name: 'Curso Demo 2026',
        },
      },
      update: {
        tenantId: DEMO_TENANT_ID,
        name: 'Curso Demo 2026',
        deletedAt: null,
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        name: 'Curso Demo 2026',
      },
    });

    const guardian = await tx.guardian.upsert({
      where: {
        tenantId_rut: {
          tenantId: DEMO_TENANT_ID,
          rut: '12.345.678-9',
        },
      },
      update: {
        tenantId: DEMO_TENANT_ID,
        name: 'Apoderado Demo',
        email: 'apoderado.demo@edupay.example',
        phone: '+56 9 1234 5678',
        deletedAt: null,
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        rut: '12.345.678-9',
        name: 'Apoderado Demo',
        email: 'apoderado.demo@edupay.example',
        phone: '+56 9 1234 5678',
      },
    });

    const martina = await tx.student.upsert({
      where: {
        tenantId_rut: {
          tenantId: DEMO_TENANT_ID,
          rut: '20.100.000-8',
        },
      },
      update: {
        tenantId: DEMO_TENANT_ID,
        rut: '20.100.000-8',
        name: 'Martina Demo',
        courseId: course.id,
        guardianId: guardian.id,
        status: StudentStatus.ACTIVE,
        financialSetup: FinancialSetupStatus.CONFIGURED,
        deletedAt: null,
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        rut: '20.100.000-8',
        name: 'Martina Demo',
        courseId: course.id,
        guardianId: guardian.id,
        status: StudentStatus.ACTIVE,
        financialSetup: FinancialSetupStatus.CONFIGURED,
      },
    });

    const tomas = await tx.student.upsert({
      where: {
        tenantId_rut: {
          tenantId: DEMO_TENANT_ID,
          rut: '20.100.001-6',
        },
      },
      update: {
        tenantId: DEMO_TENANT_ID,
        rut: '20.100.001-6',
        name: 'Tomas Demo',
        courseId: course.id,
        guardianId: guardian.id,
        status: StudentStatus.ACTIVE,
        financialSetup: FinancialSetupStatus.CONFIGURED,
        deletedAt: null,
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        rut: '20.100.001-6',
        name: 'Tomas Demo',
        courseId: course.id,
        guardianId: guardian.id,
        status: StudentStatus.ACTIVE,
        financialSetup: FinancialSetupStatus.CONFIGURED,
      },
    });

    const matricula = await tx.paymentConcept.upsert({
      where: {
        tenantId_name: {
          tenantId: DEMO_TENANT_ID,
          name: 'Matrícula',
        },
      },
      update: {
        tenantId: DEMO_TENANT_ID,
        name: 'Matrícula',
        defaultAmount: 120000,
        isActive: true,
        deletedAt: null,
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        name: 'Matrícula',
        defaultAmount: 120000,
        isActive: true,
      },
    });

    const mensualidad = await tx.paymentConcept.upsert({
      where: {
        tenantId_name: {
          tenantId: DEMO_TENANT_ID,
          name: 'Mensualidad',
        },
      },
      update: {
        tenantId: DEMO_TENANT_ID,
        name: 'Mensualidad',
        defaultAmount: 75000,
        isActive: true,
        deletedAt: null,
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        name: 'Mensualidad',
        defaultAmount: 75000,
        isActive: true,
      },
    });

    const charges = await Promise.all([
      ensurePendingCharge(tx, {
        studentId: martina.id,
        conceptId: matricula.id,
        amount: matricula.defaultAmount,
        dueDate: new Date('2026-08-05T12:00:00.000Z'),
        notes: `${SEED_MARKER}: Martina matricula`,
      }),
      ensurePendingCharge(tx, {
        studentId: martina.id,
        conceptId: mensualidad.id,
        amount: mensualidad.defaultAmount,
        dueDate: new Date('2026-08-10T12:00:00.000Z'),
        notes: `${SEED_MARKER}: Martina mensualidad agosto`,
      }),
      ensurePendingCharge(tx, {
        studentId: tomas.id,
        conceptId: mensualidad.id,
        amount: mensualidad.defaultAmount,
        dueDate: new Date('2026-08-10T12:00:00.000Z'),
        notes: `${SEED_MARKER}: Tomas mensualidad agosto`,
      }),
    ]);

    return {
      tenant,
      guardian,
      course,
      students: [martina, tomas],
      concepts: [matricula, mensualidad],
      charges,
    };
  });

  console.log('✅ Seed demo.edupay completado');
  console.log(`Tenant: ${result.tenant.name} (${result.tenant.id})`);
  console.log(`Curso: ${result.course.name} (${result.course.id})`);
  console.log(`Apoderado: ${result.guardian.name} (${result.guardian.rut})`);
  console.log(`Email: ${result.guardian.email}`);
  console.log(
    `Alumnos: ${result.students
      .map((student) => `${student.name} (${student.rut})`)
      .join(', ')}`,
  );
  console.log(
    `Conceptos: ${result.concepts
      .map((concept) => `${concept.name} (${concept.id})`)
      .join(', ')}`,
  );
  console.log(
    `Cargos PENDING: ${result.charges
      .map((charge) => `${charge.id}:${charge.amount}`)
      .join(', ')}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('❌ No fue posible crear el seed demo.edupay:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
