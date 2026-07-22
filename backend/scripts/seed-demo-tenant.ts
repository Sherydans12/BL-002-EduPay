import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ChargeStatus,
  FinancialSetupStatus,
  PaymentMethod,
  PaymentSource,
  Prisma,
  PrismaClient,
  StudentStatus,
} from '@prisma/client';
import { Pool } from 'pg';

const DEMO_TENANT_ID = 'colegio-pruebas' as const;
const SEED_MARKER = 'DEMO_TENANT_SEED';

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada');
  }

  return new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString })),
    log: ['error'],
  });
}

const prisma = createPrisma();

function assertSeedScope(): void {
  if (DEMO_TENANT_ID !== 'colegio-pruebas') {
    throw new Error('El seed demo solo puede operar sobre colegio-pruebas');
  }
}

async function upsertCharge(
  tx: Prisma.TransactionClient,
  data: {
    studentId: number;
    conceptId: number;
    amount: number;
    paidAmount: number;
    dueDate: Date;
    status: ChargeStatus;
    notes: string;
  },
) {
  const existing = await tx.charge.findFirst({
    where: {
      tenantId: DEMO_TENANT_ID,
      notes: data.notes,
    },
    select: { id: true },
  });
  const chargeData = {
    tenantId: DEMO_TENANT_ID,
    studentId: data.studentId,
    conceptId: data.conceptId,
    amount: data.amount,
    paidAmount: data.paidAmount,
    dueDate: data.dueDate,
    status: data.status,
    notes: data.notes,
    deletedAt: null,
  };

  if (existing) {
    return tx.charge.update({
      where: {
        id: existing.id,
        tenantId: DEMO_TENANT_ID,
      },
      data: chargeData,
    });
  }

  return tx.charge.create({ data: chargeData });
}

async function upsertPayment(
  tx: Prisma.TransactionClient,
  data: {
    studentId: number;
    conceptId: number;
    chargeId: number;
    paymentGroupId: number;
    amount: number;
    payerRut: string;
    referenceCode: string;
  },
) {
  const existing = await tx.payment.findFirst({
    where: {
      tenantId: DEMO_TENANT_ID,
      chargeId: data.chargeId,
      referenceCode: data.referenceCode,
    },
    select: { id: true },
  });
  const paymentData = {
    tenantId: DEMO_TENANT_ID,
    amount: data.amount,
    method: PaymentMethod.TRANSFER,
    paymentDate: new Date('2026-03-05T15:00:00.000Z'),
    studentId: data.studentId,
    conceptId: data.conceptId,
    chargeId: data.chargeId,
    paymentGroupId: data.paymentGroupId,
    payerRut: data.payerRut,
    referenceCode: data.referenceCode,
    notes: `${SEED_MARKER}: pago matricula`,
    deletedAt: null,
  };

  if (existing) {
    return tx.payment.update({
      where: {
        id: existing.id,
        tenantId: DEMO_TENANT_ID,
      },
      data: paymentData,
    });
  }

  return tx.payment.create({ data: paymentData });
}

async function main(): Promise<void> {
  assertSeedScope();

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

    const firstGrade = await tx.course.upsert({
      where: {
        tenantId_name: {
          tenantId: DEMO_TENANT_ID,
          name: '1° Básico A',
        },
      },
      update: { deletedAt: null },
      create: {
        tenantId: DEMO_TENANT_ID,
        name: '1° Básico A',
      },
    });
    const secondGrade = await tx.course.upsert({
      where: {
        tenantId_name: {
          tenantId: DEMO_TENANT_ID,
          name: '2° Básico A',
        },
      },
      update: { deletedAt: null },
      create: {
        tenantId: DEMO_TENANT_ID,
        name: '2° Básico A',
      },
    });

    const guardianOne = await tx.guardian.upsert({
      where: {
        tenantId_rut: {
          tenantId: DEMO_TENANT_ID,
          rut: '12.345.678-5',
        },
      },
      update: {
        name: 'Camila Apoderada Demo',
        email: 'camila.demo@edupay.example',
        phone: '+56 9 1111 1111',
        deletedAt: null,
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        rut: '12.345.678-5',
        name: 'Camila Apoderada Demo',
        email: 'camila.demo@edupay.example',
        phone: '+56 9 1111 1111',
      },
    });
    const guardianTwo = await tx.guardian.upsert({
      where: {
        tenantId_rut: {
          tenantId: DEMO_TENANT_ID,
          rut: '11.111.111-1',
        },
      },
      update: {
        name: 'Diego Apoderado Demo',
        email: 'diego.demo@edupay.example',
        phone: '+56 9 2222 2222',
        deletedAt: null,
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        rut: '11.111.111-1',
        name: 'Diego Apoderado Demo',
        email: 'diego.demo@edupay.example',
        phone: '+56 9 2222 2222',
      },
    });

    const martina = await tx.student.upsert({
      where: {
        tenantId_rut: {
          tenantId: DEMO_TENANT_ID,
          rut: '20.000.001-5',
        },
      },
      update: {
        name: 'Martina Demo',
        courseId: firstGrade.id,
        guardianId: guardianOne.id,
        status: StudentStatus.ACTIVE,
        financialSetup: FinancialSetupStatus.CONFIGURED,
        deletedAt: null,
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        rut: '20.000.001-5',
        name: 'Martina Demo',
        courseId: firstGrade.id,
        guardianId: guardianOne.id,
        status: StudentStatus.ACTIVE,
        financialSetup: FinancialSetupStatus.CONFIGURED,
      },
    });
    const tomas = await tx.student.upsert({
      where: {
        tenantId_rut: {
          tenantId: DEMO_TENANT_ID,
          rut: '20.000.002-3',
        },
      },
      update: {
        name: 'Tomás Demo',
        courseId: secondGrade.id,
        guardianId: guardianTwo.id,
        status: StudentStatus.ACTIVE,
        financialSetup: FinancialSetupStatus.CONFIGURED,
        deletedAt: null,
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        rut: '20.000.002-3',
        name: 'Tomás Demo',
        courseId: secondGrade.id,
        guardianId: guardianTwo.id,
        status: StudentStatus.ACTIVE,
        financialSetup: FinancialSetupStatus.CONFIGURED,
      },
    });

    const enrollment = await tx.paymentConcept.upsert({
      where: {
        tenantId_name: {
          tenantId: DEMO_TENANT_ID,
          name: 'Matrícula',
        },
      },
      update: {
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
    const tuition = await tx.paymentConcept.upsert({
      where: {
        tenantId_name: {
          tenantId: DEMO_TENANT_ID,
          name: 'Colegiatura',
        },
      },
      update: {
        defaultAmount: 85000,
        isActive: true,
        deletedAt: null,
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        name: 'Colegiatura',
        defaultAmount: 85000,
        isActive: true,
      },
    });

    const paidCharge = await upsertCharge(tx, {
      studentId: martina.id,
      conceptId: enrollment.id,
      amount: enrollment.defaultAmount,
      paidAmount: enrollment.defaultAmount,
      dueDate: new Date('2026-03-05T12:00:00.000Z'),
      status: ChargeStatus.PAID,
      notes: `${SEED_MARKER}: martina matricula pagada`,
    });
    const pendingCharge = await upsertCharge(tx, {
      studentId: martina.id,
      conceptId: tuition.id,
      amount: tuition.defaultAmount,
      paidAmount: 0,
      dueDate: new Date('2026-08-05T12:00:00.000Z'),
      status: ChargeStatus.PENDING,
      notes: `${SEED_MARKER}: martina colegiatura pendiente`,
    });
    const overdueCharge = await upsertCharge(tx, {
      studentId: tomas.id,
      conceptId: tuition.id,
      amount: tuition.defaultAmount,
      paidAmount: 0,
      dueDate: new Date('2026-06-05T12:00:00.000Z'),
      status: ChargeStatus.OVERDUE,
      notes: `${SEED_MARKER}: tomas colegiatura vencida`,
    });

    const paymentGroup = await tx.paymentGroup.upsert({
      where: {
        tenantId_buyOrder: {
          tenantId: DEMO_TENANT_ID,
          buyOrder: 'DEMO-MATRICULA-MARTINA-2026',
        },
      },
      update: {
        totalAmount: enrollment.defaultAmount,
        method: PaymentMethod.TRANSFER,
        paymentDate: new Date('2026-03-05T15:00:00.000Z'),
        source: PaymentSource.MANUAL,
        isBoletaPending: false,
        notes: `${SEED_MARKER}: grupo pago matricula`,
        deletedAt: null,
      },
      create: {
        tenantId: DEMO_TENANT_ID,
        buyOrder: 'DEMO-MATRICULA-MARTINA-2026',
        totalAmount: enrollment.defaultAmount,
        method: PaymentMethod.TRANSFER,
        paymentDate: new Date('2026-03-05T15:00:00.000Z'),
        source: PaymentSource.MANUAL,
        isBoletaPending: false,
        notes: `${SEED_MARKER}: grupo pago matricula`,
      },
    });
    const payment = await upsertPayment(tx, {
      studentId: martina.id,
      conceptId: enrollment.id,
      chargeId: paidCharge.id,
      paymentGroupId: paymentGroup.id,
      amount: enrollment.defaultAmount,
      payerRut: guardianOne.rut ?? '',
      referenceCode: 'DEMO-MATRICULA-MARTINA-2026',
    });

    return {
      tenant,
      courses: [firstGrade, secondGrade],
      guardians: [guardianOne, guardianTwo],
      students: [martina, tomas],
      concepts: [enrollment, tuition],
      charges: [paidCharge, pendingCharge, overdueCharge],
      payment,
    };
  });

  console.log(`Seed idempotente completado para ${result.tenant.id}`);
  console.log(
    `Cursos=${result.courses.length}, apoderados=${result.guardians.length}, alumnos=${result.students.length}, conceptos=${result.concepts.length}, cargos=${result.charges.length}, pagos=1`,
  );
  console.log(
    `RUTs de prueba: ${result.guardians.map((guardian) => guardian.rut).join(', ')}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('No fue posible crear el seed de colegio-pruebas:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
