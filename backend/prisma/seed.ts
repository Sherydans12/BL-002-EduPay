import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

async function main() {
  console.log('Levantando contexto de NestJS para el seeder...');
  // Iniciamos la app sin levantar el puerto HTTP
  const app = await NestFactory.createApplicationContext(AppModule);

  // Obtenemos tu PrismaService ya configurado correctamente por NestJS
  const prisma = app.get(PrismaService);

  try {
    console.log('Iniciando el proceso de seed...');

    // 1. Crear permisos básicos
    const permissions = [
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

    const createdPermissions = [];
    for (const action of permissions) {
      const perm = await prisma.permission.upsert({
        where: { action },
        update: {},
        create: { action },
      });
      createdPermissions.push(perm);
    }
    console.log('Permisos asegurados.');

    // 2. Crear rol SUPER_ADMIN
    const superAdminRole = await prisma.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      update: {
        permissions: {
          set: createdPermissions.map((p) => ({ id: p.id })),
        },
      },
      create: {
        name: 'SUPER_ADMIN',
        description: 'Administrador con acceso total',
        permissions: {
          connect: createdPermissions.map((p) => ({ id: p.id })),
        },
      },
    });
    console.log('Rol SUPER_ADMIN configurado con todos los permisos.');

    // 3. Crear usuario inicial
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
    console.log(`Usuario inicial creado/actualizado: ${adminUser.email}`);

    // 4. Crear concepto de pago por defecto
    await prisma.paymentConcept.upsert({
      where: { name: 'Mensualidad General' },
      update: {},
      create: {
        name: 'Mensualidad General',
        defaultAmount: 75000,
        isActive: true,
      },
    });
    console.log('Concepto de pago por defecto asegurado: Mensualidad General');
  } catch (error) {
    console.error('Error durante el seed:', error);
  } finally {
    // Cerramos la conexión y la app de Nest
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
