import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ChargeStatus,
  FinancialSetupStatus,
  PaymentMethod,
  PaymentSource,
  PrismaClient,
  StudentStatus,
} from '@prisma/client';
import { Pool } from 'pg';

const GUARDIAN_RUT = '12.345.678-9';
const MARTINA_RUT = '20.000.000-5';
const TOMAS_RUT = '20.000.001-3';
const SEED_MARKER = 'PORTAL_TEST_SEED';
const SEED_PAYMENT_ORDER = 'SEED-PORTAL-MARTINA-MARZO-2026';
const PRIMARY_TENANT_ID = 'colegio-conquistadores';
const TEST_TENANT_ID = 'colegio-pruebas';

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

async function main(): Promise<void> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.tenant.upsert({
      where: { id: PRIMARY_TENANT_ID },
      update: {
        name: 'Colegio Conquistadores',
        slug: 'colegio-conquistadores',
        isActive: true,
      },
      create: {
        id: PRIMARY_TENANT_ID,
        name: 'Colegio Conquistadores',
        slug: 'colegio-conquistadores',
        isActive: true,
      },
    });

    const testTenant = await tx.tenant.upsert({
      where: { id: TEST_TENANT_ID },
      update: {
        name: 'Colegio de Pruebas',
        slug: 'colegio-pruebas',
        isActive: true,
      },
      create: {
        id: TEST_TENANT_ID,
        name: 'Colegio de Pruebas',
        slug: 'colegio-pruebas',
        isActive: true,
      },
    });

    const mensualidad = await tx.paymentConcept.upsert({
      where: {
        tenantId_name: {
          tenantId: TEST_TENANT_ID,
          name: 'Mensualidad Portal Test',
        },
      },
      update: {
        defaultAmount: 50000,
        isActive: true,
        deletedAt: null,
      },
      create: {
        tenantId: TEST_TENANT_ID,
        name: 'Mensualidad Portal Test',
        defaultAmount: 50000,
        isActive: true,
      },
    });

    const terceroMedio =
      (await tx.course.findFirst({
        where: {
          tenantId: TEST_TENANT_ID,
          name: '3° Medio',
          deletedAt: null,
        },
      })) ??
      (await tx.course.create({
        data: { tenantId: TEST_TENANT_ID, name: '3° Medio' },
      }));

    const quintoBasico =
      (await tx.course.findFirst({
        where: {
          tenantId: TEST_TENANT_ID,
          name: '5° Básico',
          deletedAt: null,
        },
      })) ??
      (await tx.course.create({
        data: { tenantId: TEST_TENANT_ID, name: '5° Básico' },
      }));

    const guardian = await tx.guardian.upsert({
      where: {
        tenantId_rut: { tenantId: TEST_TENANT_ID, rut: GUARDIAN_RUT },
      },
      update: {
        name: 'Carolina Fuentes',
        email: 'carolina.fuentes.portal@example.com',
        phone: '+56 9 5555 0101',
        deletedAt: null,
      },
      create: {
        tenantId: TEST_TENANT_ID,
        rut: GUARDIAN_RUT,
        name: 'Carolina Fuentes',
        email: 'carolina.fuentes.portal@example.com',
        phone: '+56 9 5555 0101',
      },
    });

    const martina = await tx.student.upsert({
      where: {
        tenantId_rut: { tenantId: TEST_TENANT_ID, rut: MARTINA_RUT },
      },
      update: {
        name: 'Martina Fuentes',
        courseId: terceroMedio.id,
        guardianId: guardian.id,
        status: StudentStatus.ACTIVE,
        financialSetup: FinancialSetupStatus.CONFIGURED,
        deletedAt: null,
      },
      create: {
        tenantId: TEST_TENANT_ID,
        rut: MARTINA_RUT,
        name: 'Martina Fuentes',
        courseId: terceroMedio.id,
        guardianId: guardian.id,
        status: StudentStatus.ACTIVE,
        financialSetup: FinancialSetupStatus.CONFIGURED,
      },
    });

    const tomas = await tx.student.upsert({
      where: {
        tenantId_rut: { tenantId: TEST_TENANT_ID, rut: TOMAS_RUT },
      },
      update: {
        name: 'Tomás Fuentes',
        courseId: quintoBasico.id,
        guardianId: guardian.id,
        status: StudentStatus.ACTIVE,
        financialSetup: FinancialSetupStatus.CONFIGURED,
        deletedAt: null,
      },
      create: {
        tenantId: TEST_TENANT_ID,
        rut: TOMAS_RUT,
        name: 'Tomás Fuentes',
        courseId: quintoBasico.id,
        guardianId: guardian.id,
        status: StudentStatus.ACTIVE,
        financialSetup: FinancialSetupStatus.CONFIGURED,
      },
    });

    // Permite ejecutar nuevamente el seeder y recuperar el escenario inicial.
    const previousCharges = await tx.charge.findMany({
      where: {
        tenantId: TEST_TENANT_ID,
        notes: { startsWith: SEED_MARKER },
        studentId: { in: [martina.id, tomas.id] },
      },
      select: { id: true },
    });

    if (previousCharges.length > 0) {
      const chargeIds = previousCharges.map((charge) => charge.id);
      const linkedPayments = await tx.payment.findMany({
        where: {
          tenantId: TEST_TENANT_ID,
          chargeId: { in: chargeIds },
        },
        select: { paymentGroupId: true },
      });
      const groupIds = [
        ...new Set(
          linkedPayments
            .map((payment) => payment.paymentGroupId)
            .filter((id): id is number => id !== null),
        ),
      ];

      await tx.payment.deleteMany({
        where: {
          tenantId: TEST_TENANT_ID,
          chargeId: { in: chargeIds },
        },
      });
      await tx.charge.deleteMany({
        where: { tenantId: TEST_TENANT_ID, id: { in: chargeIds } },
      });

      for (const groupId of groupIds) {
        const remainingPayments = await tx.payment.count({
          where: { tenantId: TEST_TENANT_ID, paymentGroupId: groupId },
        });
        if (remainingPayments === 0) {
          await tx.paymentGroup.delete({ where: { id: groupId } });
        }
      }
    }

    // Limpia el grupo manual del seed si quedó huérfano.
    const previousSeedGroup = await tx.paymentGroup.findUnique({
      where: {
        tenantId_buyOrder: {
          tenantId: TEST_TENANT_ID,
          buyOrder: SEED_PAYMENT_ORDER,
        },
      },
      select: { id: true, _count: { select: { payments: true } } },
    });
    if (previousSeedGroup?._count.payments === 0) {
      await tx.paymentGroup.delete({ where: { id: previousSeedGroup.id } });
    }

    const martinaMarch = await tx.charge.create({
      data: {
        tenantId: TEST_TENANT_ID,
        studentId: martina.id,
        conceptId: mensualidad.id,
        amount: 50000,
        paidAmount: 50000,
        dueDate: new Date('2026-03-10T12:00:00.000Z'),
        status: ChargeStatus.PAID,
        notes: `${SEED_MARKER}: Martina marzo`,
      },
    });

    const martinaApril = await tx.charge.create({
      data: {
        tenantId: TEST_TENANT_ID,
        studentId: martina.id,
        conceptId: mensualidad.id,
        amount: 50000,
        paidAmount: 0,
        dueDate: new Date('2026-04-10T12:00:00.000Z'),
        status: ChargeStatus.OVERDUE,
        notes: `${SEED_MARKER}: Martina abril`,
      },
    });

    const martinaMay = await tx.charge.create({
      data: {
        tenantId: TEST_TENANT_ID,
        studentId: martina.id,
        conceptId: mensualidad.id,
        amount: 50000,
        paidAmount: 0,
        dueDate: new Date('2026-05-10T12:00:00.000Z'),
        status: ChargeStatus.PENDING,
        notes: `${SEED_MARKER}: Martina mayo`,
      },
    });

    const tomasApril = await tx.charge.create({
      data: {
        tenantId: TEST_TENANT_ID,
        studentId: tomas.id,
        conceptId: mensualidad.id,
        amount: 45000,
        paidAmount: 0,
        dueDate: new Date('2026-04-10T12:00:00.000Z'),
        status: ChargeStatus.PENDING,
        notes: `${SEED_MARKER}: Tomás abril`,
      },
    });

    const paymentGroup = await tx.paymentGroup.create({
      data: {
        tenantId: TEST_TENANT_ID,
        buyOrder: SEED_PAYMENT_ORDER,
        totalAmount: 50000,
        method: PaymentMethod.TRANSFER,
        paymentDate: new Date('2026-03-05T12:00:00.000Z'),
        source: PaymentSource.MANUAL,
        notes: `${SEED_MARKER}: pago histórico de marzo`,
      },
    });

    await tx.payment.create({
      data: {
        tenantId: TEST_TENANT_ID,
        amount: 50000,
        method: PaymentMethod.TRANSFER,
        paymentDate: new Date('2026-03-05T12:00:00.000Z'),
        studentId: martina.id,
        conceptId: mensualidad.id,
        chargeId: martinaMarch.id,
        paymentGroupId: paymentGroup.id,
        payerName: guardian.name,
        payerRut: guardian.rut,
        referenceCode: SEED_PAYMENT_ORDER,
      },
    });

    return {
      testTenant,
      guardian,
      martina,
      tomas,
      charges: {
        martinaMarch,
        martinaApril,
        martinaMay,
        tomasApril,
      },
    };
  });

  console.log('✅ Seed transaccional del Portal completado');
  console.log(`Tenant: ${result.testTenant.name} (${result.testTenant.id})`);
  console.log(`Apoderado: ${result.guardian.name} (${result.guardian.rut})`);
  console.log(`Email: ${result.guardian.email}`);
  console.log(
    `Martina: studentId=${result.martina.id}, cuotas=${[
      result.charges.martinaMarch.id,
      result.charges.martinaApril.id,
      result.charges.martinaMay.id,
    ].join(',')}`,
  );
  console.log(
    `Tomás: studentId=${result.tomas.id}, cuota=${result.charges.tomasApril.id}`,
  );
  console.log('');
  console.log('Prueba rápida:');
  console.log(
    `curl -H "Authorization: Bearer $EDUPAY_API_KEY" -H "x-tenant-id: ${TEST_TENANT_ID}" "http://localhost:3001/api/v1/portal/guardian/${GUARDIAN_RUT}"`,
  );
  console.log(
    `curl -H "Authorization: Bearer $EDUPAY_API_KEY" -H "x-tenant-id: ${TEST_TENANT_ID}" "http://localhost:3001/api/v1/portal/guardian/${GUARDIAN_RUT}/statement"`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('❌ No fue posible crear el seed del Portal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
