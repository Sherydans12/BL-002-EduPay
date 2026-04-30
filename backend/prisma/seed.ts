import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando el seeder...');

  // 1. Crear permisos b\u00e1sicos
  const permissions = [
    'manage:users',
    'manage:roles',
    'create:payment',
    'view:payments',
    'view:reports',
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
        set: createdPermissions.map(p => ({ id: p.id })),
      },
    },
    create: {
      name: 'SUPER_ADMIN',
      description: 'Administrador con acceso total',
      permissions: {
        connect: createdPermissions.map(p => ({ id: p.id })),
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
