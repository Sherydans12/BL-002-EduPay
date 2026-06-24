import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

function createPrisma() {
  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter, log: ['error'] });
}

const prisma = createPrisma();
const PRIMARY_TENANT_ID = 'colegio-conquistadores';

async function main() {
  console.log('🌱 Iniciando el proceso de seed...');

  await prisma.tenant.upsert({
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

  // ─── 1. Permisos ────────────────────────────────────────────
  const permissionActions = [
    'manage:users',
    'manage:roles',
    'view:users',
    'view:roles',
    'create:payment',
    'view:payments',
    'manage:payments',
    'view:reports',
    'view:courses',
    'manage:courses',
    'view:students',
    'manage:students',
    'view:guardians',
    'manage:guardians',
    'view:payment-concepts',
    'manage:payment-concepts',
  ];

  const createdPermissions: { id: string }[] = [];
  for (const action of permissionActions) {
    const perm = await prisma.permission.upsert({
      where: { action },
      update: {},
      create: { action },
    });
    createdPermissions.push(perm);
  }
  console.log('✅ Permisos asegurados.');

  // ─── 2. Rol SUPER_ADMIN ──────────────────────────────────────
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: {
      permissions: { set: createdPermissions.map((p) => ({ id: p.id })) },
    },
    create: {
      name: 'SUPER_ADMIN',
      description: 'Administrador con acceso total',
      permissions: { connect: createdPermissions.map((p) => ({ id: p.id })) },
    },
  });
  console.log('✅ Rol SUPER_ADMIN configurado.');

  // ─── 3. Usuario admin ────────────────────────────────────────
  const adminEmail = 'admin@baselogic.cl';
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedPassword,
      roleId: superAdminRole.id,
      isActive: true,
    },
    create: {
      email: adminEmail,
      name: 'Super Administrador',
      password: hashedPassword,
      roleId: superAdminRole.id,
      isActive: true,
    },
  });
  console.log(`✅ Usuario admin: ${adminUser.email}`);

  // ─── 4. Conceptos de pago ────────────────────────────────────
  const mensualidad = await prisma.paymentConcept.upsert({
    where: {
      tenantId_name: {
        tenantId: PRIMARY_TENANT_ID,
        name: 'Mensualidad General',
      },
    },
    update: {},
    create: {
      name: 'Mensualidad General',
      defaultAmount: 75000,
      isActive: true,
    },
  });

  const matricula = await prisma.paymentConcept.upsert({
    where: {
      tenantId_name: {
        tenantId: PRIMARY_TENANT_ID,
        name: 'Matrícula',
      },
    },
    update: {},
    create: { name: 'Matrícula', defaultAmount: 120000, isActive: true },
  });

  const actividades = await prisma.paymentConcept.upsert({
    where: {
      tenantId_name: {
        tenantId: PRIMARY_TENANT_ID,
        name: 'Actividades Extracurriculares',
      },
    },
    update: {},
    create: {
      name: 'Actividades Extracurriculares',
      defaultAmount: 25000,
      isActive: true,
    },
  });
  console.log('✅ Conceptos de pago asegurados.');

  // ─── 5. Cursos ───────────────────────────────────────────────
  const cursosData = [
    'Kínder A',
    '1° Básico A',
    '2° Básico B',
    '3° Básico A',
    '1° Medio A',
  ];

  const cursos: { id: number; name: string }[] = [];
  for (const name of cursosData) {
    const existing = await prisma.course.findFirst({
      where: { name, deletedAt: null },
    });
    if (existing) {
      cursos.push(existing);
    } else {
      cursos.push(await prisma.course.create({ data: { name } }));
    }
  }
  console.log(`✅ ${cursos.length} cursos asegurados.`);

  // ─── 6. Apoderados ───────────────────────────────────────────
  const apoderadosData = [
    {
      rut: '12.345.678-9',
      name: 'Carlos Muñoz Díaz',
      email: 'carlos.munoz@demo.cl',
      phone: '+56 9 1111 1111',
    },
    {
      rut: '15.432.100-K',
      name: 'María Fernández López',
      email: 'maria.fernandez@demo.cl',
      phone: '+56 9 2222 2222',
    },
    {
      rut: '11.876.543-2',
      name: 'Roberto González Silva',
      email: 'roberto.gonzalez@demo.cl',
      phone: '+56 9 3333 3333',
    },
    {
      rut: '14.210.987-5',
      name: 'Ana Rodríguez Pérez',
      email: 'ana.rodriguez@demo.cl',
      phone: '+56 9 4444 4444',
    },
    {
      rut: '9.876.543-1',
      name: 'Patricio Soto Vargas',
      email: 'patricio.soto@demo.cl',
      phone: '+56 9 5555 5555',
    },
  ];

  const apoderados: { id: number }[] = [];
  for (const a of apoderadosData) {
    const existing = await prisma.guardian.findUnique({
      where: {
        tenantId_rut: { tenantId: PRIMARY_TENANT_ID, rut: a.rut },
      },
    });
    apoderados.push(existing ?? (await prisma.guardian.create({ data: a })));
  }
  console.log(`✅ ${apoderados.length} apoderados asegurados.`);

  // ─── 7. Alumnos ──────────────────────────────────────────────
  const alumnosData = [
    {
      rut: '22.111.001-1',
      name: 'Sofía Muñoz Reyes',
      courseIdx: 1,
      guardianIdx: 0,
      status: 'ACTIVE' as const,
      financialSetup: 'CONFIGURED' as const,
    },
    {
      rut: '22.111.002-2',
      name: 'Diego Fernández Torres',
      courseIdx: 1,
      guardianIdx: 1,
      status: 'ACTIVE' as const,
      financialSetup: 'CONFIGURED' as const,
    },
    {
      rut: '22.111.003-3',
      name: 'Valentina González Mora',
      courseIdx: 2,
      guardianIdx: 2,
      status: 'ACTIVE' as const,
      financialSetup: 'CONFIGURED' as const,
    },
    {
      rut: '22.111.004-4',
      name: 'Matías Rodríguez Fuentes',
      courseIdx: 3,
      guardianIdx: 3,
      status: 'ACTIVE' as const,
      financialSetup: 'CONFIGURED' as const,
    },
    {
      rut: '22.111.005-5',
      name: 'Camila Soto Navarro',
      courseIdx: 4,
      guardianIdx: 4,
      status: 'ACTIVE' as const,
      financialSetup: 'CONFIGURED' as const,
    },
    {
      rut: '22.111.006-6',
      name: 'Benjamín Muñoz Castro',
      courseIdx: 0,
      guardianIdx: 0,
      status: 'ACTIVE' as const,
      financialSetup: 'CONFIGURED' as const,
    },
    {
      rut: '22.111.007-7',
      name: 'Isidora Fernández Alves',
      courseIdx: 2,
      guardianIdx: 1,
      status: 'ACTIVE' as const,
      financialSetup: 'PENDING' as const,
    },
    {
      rut: '22.111.008-8',
      name: 'Sebastián González Vera',
      courseIdx: 3,
      guardianIdx: 2,
      status: 'INACTIVE' as const,
      financialSetup: 'PENDING' as const,
    },
  ];

  const alumnos: { id: number }[] = [];
  for (const a of alumnosData) {
    const existing = await prisma.student.findUnique({
      where: {
        tenantId_rut: { tenantId: PRIMARY_TENANT_ID, rut: a.rut },
      },
    });
    if (existing) {
      alumnos.push(existing);
    } else {
      alumnos.push(
        await prisma.student.create({
          data: {
            rut: a.rut,
            name: a.name,
            courseId: cursos[a.courseIdx].id,
            guardianId: apoderados[a.guardianIdx].id,
            status: a.status,
            financialSetup: a.financialSetup,
          },
        }),
      );
    }
  }
  console.log(`✅ ${alumnos.length} alumnos asegurados.`);

  // ─── 8. Cargos y Pagos ───────────────────────────────────────
  const activeStudents = alumnos.filter(
    (_, i) => alumnosData[i].financialSetup === 'CONFIGURED',
  );
  const now = new Date();
  let chargesCreated = 0;
  let paymentsCreated = 0;
  const METHODS = [
    'CASH',
    'TRANSFER',
    'DEBIT',
    'CASH',
    'TRANSFER',
    'DEBIT',
  ] as const;

  for (let i = 0; i < activeStudents.length; i++) {
    const student = activeStudents[i];

    // Matrícula (pagada)
    const existingMat = await prisma.charge.findFirst({
      where: {
        studentId: student.id,
        conceptId: matricula.id,
        deletedAt: null,
      },
    });
    if (!existingMat) {
      const chargeM = await prisma.charge.create({
        data: {
          studentId: student.id,
          conceptId: matricula.id,
          amount: 120000,
          paidAmount: 120000,
          dueDate: new Date(now.getFullYear(), 0, 31),
          status: 'PAID',
        },
      });
      chargesCreated++;
      await prisma.payment.create({
        data: {
          amount: 120000,
          method: 'TRANSFER',
          paymentDate: new Date(now.getFullYear(), 0, 15),
          studentId: student.id,
          conceptId: matricula.id,
          chargeId: chargeM.id,
        },
      });
      paymentsCreated++;
    }

    // Mensualidades Mar–Jun
    for (let mes = 3; mes <= 6; mes++) {
      const dueDate = new Date(now.getFullYear(), mes - 1, 10);
      const existing = await prisma.charge.findFirst({
        where: {
          studentId: student.id,
          conceptId: mensualidad.id,
          dueDate,
          deletedAt: null,
        },
      });
      if (!existing) {
        const isPaid = mes <= 5;
        const isOverdue = mes === 6 && i % 2 === 0;
        const status = isPaid ? 'PAID' : isOverdue ? 'OVERDUE' : 'PENDING';

        const charge = await prisma.charge.create({
          data: {
            studentId: student.id,
            conceptId: mensualidad.id,
            amount: 75000,
            paidAmount: isPaid ? 75000 : 0,
            dueDate,
            status,
          },
        });
        chargesCreated++;

        if (isPaid) {
          await prisma.payment.create({
            data: {
              amount: 75000,
              method: METHODS[i % METHODS.length],
              paymentDate: new Date(now.getFullYear(), mes - 1, 5 + i),
              studentId: student.id,
              conceptId: mensualidad.id,
              chargeId: charge.id,
            },
          });
          paymentsCreated++;
        }
      }
    }

    // Actividades (primeros 3)
    if (i < 3) {
      const existingAct = await prisma.charge.findFirst({
        where: {
          studentId: student.id,
          conceptId: actividades.id,
          deletedAt: null,
        },
      });
      if (!existingAct) {
        const chargeA = await prisma.charge.create({
          data: {
            studentId: student.id,
            conceptId: actividades.id,
            amount: 25000,
            paidAmount: 25000,
            dueDate: new Date(now.getFullYear(), 2, 28),
            status: 'PAID',
          },
        });
        chargesCreated++;
        await prisma.payment.create({
          data: {
            amount: 25000,
            method: 'CASH',
            paymentDate: new Date(now.getFullYear(), 2, 20),
            studentId: student.id,
            conceptId: actividades.id,
            chargeId: chargeA.id,
          },
        });
        paymentsCreated++;
      }
    }
  }

  console.log(
    `✅ ${chargesCreated} cargos y ${paymentsCreated} pagos creados.`,
  );

  console.log('\n═══════════════════════════════════════════');
  console.log('🎉 SEED COMPLETADO EXITOSAMENTE');
  console.log('═══════════════════════════════════════════');
  console.log('📧 Usuario:    admin@baselogic.cl');
  console.log('🔑 Password:   admin123');
  console.log('═══════════════════════════════════════════');
  console.log(`📚 Cursos:     ${cursos.length}`);
  console.log(`👥 Alumnos:    ${alumnos.length}`);
  console.log(`👨‍👩‍👧 Apoderados: ${apoderados.length}`);
  console.log(`💳 Pagos:      ${paymentsCreated}`);
  console.log('═══════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
