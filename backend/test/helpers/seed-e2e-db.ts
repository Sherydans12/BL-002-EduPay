import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../src/prisma/prisma.service';

export type E2eSeedContext = {
  accessToken: string;
  studentId: number;
  student2Id: number;
  conceptId: number;
  courseId: number;
};

const E2E_PERMISSIONS = ['create:payment', 'view:payments', 'manage:payments'];

export async function resetE2eDatabase(prisma: PrismaService): Promise<void> {
  await prisma.payment.deleteMany();
  await prisma.paymentGroup.deleteMany();
  await prisma.student.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.course.deleteMany();
  await prisma.paymentConcept.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
}

export async function seedE2eDatabase(
  prisma: PrismaService,
  login: (email: string, password: string) => Promise<{ access_token: string }>,
): Promise<E2eSeedContext> {
  await resetE2eDatabase(prisma);

  const permissions = await Promise.all(
    E2E_PERMISSIONS.map((action) =>
      prisma.permission.create({ data: { action } }),
    ),
  );

  const role = await prisma.role.create({
    data: {
      name: 'E2E_ADMIN',
      description: 'Rol para pruebas e2e',
      permissions: { connect: permissions.map((p) => ({ id: p.id })) },
    },
  });

  await prisma.user.create({
    data: {
      email: 'e2e@baselogic.cl',
      name: 'E2E Tester',
      password: await bcrypt.hash('e2e-secret', 10),
      roleId: role.id,
      isActive: true,
    },
  });

  const course = await prisma.course.create({ data: { name: 'Curso E2E' } });
  const guardian = await prisma.guardian.create({
    data: {
      rut: '11.111.111-1',
      name: 'Apoderado E2E',
      email: 'apoderado.e2e@example.com',
    },
  });

  const student = await prisma.student.create({
    data: {
      rut: '22.222.222-2',
      name: 'Alumno E2E 1',
      courseId: course.id,
      guardianId: guardian.id,
    },
  });

  const student2 = await prisma.student.create({
    data: {
      rut: '33.333.333-3',
      name: 'Alumno E2E 2',
      courseId: course.id,
      guardianId: guardian.id,
    },
  });

  const concept = await prisma.paymentConcept.create({
    data: {
      name: 'Mensualidad E2E',
      defaultAmount: 75000,
      isActive: true,
    },
  });

  const { access_token } = await login('e2e@baselogic.cl', 'e2e-secret');

  return {
    accessToken: access_token,
    studentId: student.id,
    student2Id: student2.id,
    conceptId: concept.id,
    courseId: course.id,
  };
}
