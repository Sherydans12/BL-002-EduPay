import 'dotenv/config';
import { PrismaClient, ChargeStatus, FinancialSetupStatus, StudentStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function calculateDv(rutBody: number): string {
  let sum = 0;
  let mul = 2;
  let temp = rutBody;
  while (temp > 0) {
    sum += (temp % 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
    temp = Math.floor(temp / 10);
  }
  const res = 11 - (sum % 11);
  if (res === 11) return '0';
  if (res === 10) return 'K';
  return res.toString();
}

function formatRut(num: number): string {
  const dv = calculateDv(num);
  const str = num.toString();
  let formatted = '';
  let count = 0;
  for (let i = str.length - 1; i >= 0; i--) {
    formatted = str[i] + formatted;
    count++;
    if (count % 3 === 0 && i !== 0) {
      formatted = '.' + formatted;
    }
  }
  return `${formatted}-${dv}`;
}

function createPrisma() {
  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return { prisma: new PrismaClient({ adapter, log: ['error'] }), pool };
}

const TENANT_ID = 'colegio-pruebas';

async function main() {
  const { prisma, pool } = createPrisma();
  console.log(`🏫 Creando datos de prueba para el tenant: ${TENANT_ID}...`);

  try {
    // 1. Asegurar Tenant
    const tenant = await prisma.tenant.upsert({
      where: { id: TENANT_ID },
      update: { name: 'Colegio de Pruebas', slug: 'colegio-pruebas', isActive: true },
      create: { id: TENANT_ID, name: 'Colegio de Pruebas', slug: 'colegio-pruebas', isActive: true },
    });
    console.log(`✅ Tenant asegurado: ${tenant.name}`);

    // 2. Conceptos de pago
    const conceptNames = [
      { name: 'Mensualidad General', defaultAmount: 75000 },
      { name: 'Matrícula 2026', defaultAmount: 120000 },
      { name: 'Taller Extracurricular', defaultAmount: 30000 },
      { name: 'Cuota Centro de Padres', defaultAmount: 15000 },
      { name: 'Seguro Escolar', defaultAmount: 20000 },
    ];

    const concepts: Record<string, number> = {};
    for (const c of conceptNames) {
      const existing = await prisma.paymentConcept.findFirst({
        where: { tenantId: TENANT_ID, name: c.name, deletedAt: null },
      });
      if (existing) {
        concepts[c.name] = existing.id;
      } else {
        const created = await prisma.paymentConcept.create({
          data: {
            tenantId: TENANT_ID,
            name: c.name,
            defaultAmount: c.defaultAmount,
            isActive: true,
          },
        });
        concepts[c.name] = created.id;
      }
    }
    console.log('✅ Conceptos de pago configurados:', Object.keys(concepts));

    // 3. Cursos
    const courseNames = [
      'Kínder A',
      '1° Básico A',
      '2° Básico A',
      '3° Básico A',
      '4° Básico A',
      '5° Básico A',
      '6° Básico A',
      '1° Medio A',
      '2° Medio A',
      '3° Medio A',
    ];

    const courses: Record<string, number> = {};
    for (const name of courseNames) {
      const existing = await prisma.course.findFirst({
        where: { tenantId: TENANT_ID, name, deletedAt: null },
      });
      if (existing) {
        courses[name] = existing.id;
      } else {
        const created = await prisma.course.create({
          data: {
            tenantId: TENANT_ID,
            name,
          },
        });
        courses[name] = created.id;
      }
    }
    console.log('✅ Cursos configurados:', Object.keys(courses));

    // 4. Familias de Apoderados y Alumnos
    const families = [
      {
        guardianRutNum: 14872341,
        guardianName: 'Roberto Carlos Morales Soto',
        guardianEmail: 'roberto.morales@example.com',
        guardianPhone: '+56 9 8765 4321',
        students: [
          {
            rutNum: 22451982,
            name: 'Matías Ignacio Morales Castro',
            courseName: '2° Básico A',
            charges: [
              { concept: 'Matrícula 2026', amount: 120000, paid: 120000, status: ChargeStatus.PAID, due: '2026-02-28' },
              { concept: 'Mensualidad General', amount: 75000, paid: 75000, status: ChargeStatus.PAID, due: '2026-03-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.OVERDUE, due: '2026-04-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.OVERDUE, due: '2026-05-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.PENDING, due: '2026-09-10' },
              { concept: 'Taller Extracurricular', amount: 30000, paid: 0, status: ChargeStatus.PENDING, due: '2026-09-15' },
            ],
          },
          {
            rutNum: 24120543,
            name: 'Valentina Sofía Morales Castro',
            courseName: 'Kínder A',
            charges: [
              { concept: 'Matrícula 2026', amount: 120000, paid: 120000, status: ChargeStatus.PAID, due: '2026-02-28' },
              { concept: 'Mensualidad General', amount: 75000, paid: 75000, status: ChargeStatus.PAID, due: '2026-03-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.OVERDUE, due: '2026-04-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.OVERDUE, due: '2026-05-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.PENDING, due: '2026-09-10' },
            ],
          },
          {
            rutNum: 21890321,
            name: 'Lucas Benjamín Morales Castro',
            courseName: '6° Básico A',
            charges: [
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.OVERDUE, due: '2026-05-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.PENDING, due: '2026-09-10' },
              { concept: 'Cuota Centro de Padres', amount: 15000, paid: 0, status: ChargeStatus.PENDING, due: '2026-09-20' },
            ],
          },
        ],
      },
      {
        guardianRutNum: 16234908,
        guardianName: 'Francisca Javiera Herrera Lagos',
        guardianEmail: 'francisca.herrera@example.com',
        guardianPhone: '+56 9 7654 3210',
        students: [
          {
            rutNum: 23876124,
            name: 'Joaquín Alonso Silva Herrera',
            courseName: '4° Básico A',
            charges: [
              { concept: 'Mensualidad General', amount: 75000, paid: 35000, status: ChargeStatus.PARTIALLY_PAID, due: '2026-05-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.PENDING, due: '2026-09-10' },
              { concept: 'Taller Extracurricular', amount: 30000, paid: 0, status: ChargeStatus.PENDING, due: '2026-09-15' },
            ],
          },
          {
            rutNum: 25340912,
            name: 'Florencia Paz Silva Herrera',
            courseName: '1° Básico A',
            charges: [
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.PENDING, due: '2026-09-10' },
              { concept: 'Seguro Escolar', amount: 20000, paid: 0, status: ChargeStatus.PENDING, due: '2026-09-25' },
            ],
          },
        ],
      },
      {
        guardianRutNum: 13567890,
        guardianName: 'Alejandro Andrés Valenzuela Tapia',
        guardianEmail: 'alejandro.valenzuela@example.com',
        guardianPhone: '+56 9 9123 4567',
        students: [
          {
            rutNum: 21543876,
            name: 'Agustín Andrés Valenzuela Rojas',
            courseName: '1° Medio A',
            charges: [
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.OVERDUE, due: '2026-03-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.OVERDUE, due: '2026-04-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.OVERDUE, due: '2026-05-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 0, status: ChargeStatus.PENDING, due: '2026-09-10' },
            ],
          },
        ],
      },
      {
        guardianRutNum: 15987654,
        guardianName: 'Camila Andrea Muñoz Navarrete',
        guardianEmail: 'camila.munoz@example.com',
        guardianPhone: '+56 9 6543 2109',
        students: [
          {
            rutNum: 23112987,
            name: 'Isidora Belén Castro Muñoz',
            courseName: '3° Básico A',
            charges: [
              { concept: 'Matrícula 2026', amount: 120000, paid: 120000, status: ChargeStatus.PAID, due: '2026-02-28' },
              { concept: 'Mensualidad General', amount: 75000, paid: 75000, status: ChargeStatus.PAID, due: '2026-03-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 75000, status: ChargeStatus.PAID, due: '2026-04-10' },
              { concept: 'Mensualidad General', amount: 75000, paid: 75000, status: ChargeStatus.PAID, due: '2026-05-10' },
            ],
          },
        ],
      },
    ];

    for (const fam of families) {
      const guardianRut = formatRut(fam.guardianRutNum);
      const guardian = await prisma.guardian.upsert({
        where: { tenantId_rut: { tenantId: TENANT_ID, rut: guardianRut } },
        update: {
          name: fam.guardianName,
          email: fam.guardianEmail,
          phone: fam.guardianPhone,
        },
        create: {
          tenantId: TENANT_ID,
          rut: guardianRut,
          name: fam.guardianName,
          email: fam.guardianEmail,
          phone: fam.guardianPhone,
        },
      });
      console.log(`👨‍👩‍👧 Apoderado creado/actualizado: ${guardian.name} (${guardian.rut})`);

      for (const st of fam.students) {
        const studentRut = formatRut(st.rutNum);
        const courseId = courses[st.courseName];

        const student = await prisma.student.upsert({
          where: { tenantId_rut: { tenantId: TENANT_ID, rut: studentRut } },
          update: {
            name: st.name,
            courseId,
            guardianId: guardian.id,
            financialSetup: FinancialSetupStatus.CONFIGURED,
            status: StudentStatus.ACTIVE,
          },
          create: {
            tenantId: TENANT_ID,
            rut: studentRut,
            name: st.name,
            courseId,
            guardianId: guardian.id,
            financialSetup: FinancialSetupStatus.CONFIGURED,
            status: StudentStatus.ACTIVE,
          },
        });
        console.log(`  🎓 Alumno: ${student.name} (${student.rut}) -> Curso: ${st.courseName}`);

        // Crear o actualizar cuotas
        for (const ch of st.charges) {
          const conceptId = concepts[ch.concept];
          const dueDate = new Date(`${ch.due}T12:00:00Z`);

          const existingCharge = await prisma.charge.findFirst({
            where: {
              tenantId: TENANT_ID,
              studentId: student.id,
              conceptId,
              dueDate,
              deletedAt: null,
            },
          });

          if (!existingCharge) {
            await prisma.charge.create({
              data: {
                tenantId: TENANT_ID,
                studentId: student.id,
                conceptId,
                amount: ch.amount,
                paidAmount: ch.paid,
                dueDate,
                status: ch.status,
                notes: `Seed cuota: ${ch.concept}`,
              },
            });
          }
        }
      }
    }

    console.log('🎉 Seed de datos para Colegio de Pruebas completado con éxito.');
  } catch (error) {
    console.error('❌ Error al ejecutar seed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main();
