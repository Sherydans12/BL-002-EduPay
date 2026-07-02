import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TENANT_ID = 'colegio-conquistadores';
const TENANT_NAME = 'Colegio Conquistadores';
const SUPER_ADMIN_ROLE = 'SUPER_ADMIN';

function resolveEmailArg(): string | undefined {
  const emailFlagIndex = process.argv.findIndex(
    (arg) => arg === '--email' || arg === '-e',
  );

  if (emailFlagIndex >= 0) {
    return process.argv[emailFlagIndex + 1];
  }

  return process.argv.slice(2).find((arg) => !arg.startsWith('-'));
}

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada');
  }

  const pool = new Pool({ connectionString });

  return new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ['error', 'warn'],
  });
}

const prisma = createPrisma();

async function main(): Promise<void> {
  const email = resolveEmailArg();

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.upsert({
      where: { id: TENANT_ID },
      update: {
        name: TENANT_NAME,
        slug: TENANT_ID,
        isActive: true,
      },
      create: {
        id: TENANT_ID,
        name: TENANT_NAME,
        slug: TENANT_ID,
        isActive: true,
      },
    });

    const superAdminRole = await tx.role.upsert({
      where: { name: SUPER_ADMIN_ROLE },
      update: {},
      create: {
        name: SUPER_ADMIN_ROLE,
        description: 'Administrador con acceso total',
      },
    });

    const user = email
      ? await tx.user.findUnique({ where: { email } })
      : await tx.user.findFirst({ orderBy: { createdAt: 'asc' } });

    if (!user) {
      throw new Error(
        email
          ? `No existe un usuario con email ${email}`
          : 'No existe ningún usuario para rescatar',
      );
    }

    const rescuedUser = await tx.user.update({
      where: { id: user.id },
      data: {
        roleId: superAdminRole.id,
        tenantId: tenant.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        tenantId: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return { tenant, rescuedUser };
  });

  console.log('✅ Rescate de producción completado exitosamente');
  console.log({
    tenant: {
      id: result.tenant.id,
      name: result.tenant.name,
      isActive: result.tenant.isActive,
    },
    user: result.rescuedUser,
  });
}

main()
  .catch((error: unknown) => {
    console.error('❌ Error ejecutando rescate de producción:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
