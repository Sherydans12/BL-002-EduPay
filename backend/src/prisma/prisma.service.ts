import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { tenantContext } from '../core/tenant/tenant.context';

const TENANT_MODELS = new Set([
  'Course',
  'Guardian',
  'Student',
  'PaymentConcept',
  'PaymentGroup',
  'Payment',
  'Charge',
  'NotificationLog',
  'User',
]);

function currentTenantId(model: string | undefined): string | null {
  const context = tenantContext.getStore();

  if (
    !model ||
    !TENANT_MODELS.has(model) ||
    !context?.tenantId ||
    context.isSuperAdmin
  ) {
    return null;
  }

  return context.tenantId;
}

function withTenantWhere<T>(where: T, tenantId: string): T {
  return { ...(where as object), tenantId } as T;
}

function withTenantData<T>(data: T, tenantId: string): T {
  if (Array.isArray(data)) {
    return data.map((item) => ({ ...item, tenantId })) as T;
  }

  return { ...(data as object), tenantId } as T;
}

function withTenantWhereArgs<T extends { where?: unknown }>(
  args: T,
  tenantId: string,
): T {
  return {
    ...args,
    where: withTenantWhere(args.where, tenantId),
  } as T;
}

function withTenantDataArgs<T extends { data: unknown }>(
  args: T,
  tenantId: string,
): T {
  return {
    ...args,
    data: withTenantData(args.data, tenantId),
  } as T;
}

function withTenantMutationArgs<T extends { where?: unknown; data: unknown }>(
  args: T,
  tenantId: string,
): T {
  return {
    ...args,
    where: withTenantWhere(args.where, tenantId),
    data: withTenantData(args.data, tenantId),
  } as T;
}

function withTenantUpsertArgs<
  T extends { where: unknown; create: unknown; update: unknown },
>(args: T, tenantId: string): T {
  return {
    ...args,
    where: withTenantWhere(args.where, tenantId),
    create: withTenantData(args.create, tenantId),
    update: withTenantData(args.update, tenantId),
  } as T;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log: ['error', 'warn'],
    });

    return this.$extends({
      name: 'global-tenant-isolation',
      query: {
        $allModels: {
          findMany({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(tenantId ? withTenantWhereArgs(args, tenantId) : args);
          },
          findFirst({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(tenantId ? withTenantWhereArgs(args, tenantId) : args);
          },
          findUnique({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(tenantId ? withTenantWhereArgs(args, tenantId) : args);
          },
          count({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(tenantId ? withTenantWhereArgs(args, tenantId) : args);
          },
          aggregate({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(tenantId ? withTenantWhereArgs(args, tenantId) : args);
          },
          groupBy({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(tenantId ? withTenantWhereArgs(args, tenantId) : args);
          },
          create({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(tenantId ? withTenantDataArgs(args, tenantId) : args);
          },
          createMany({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(tenantId ? withTenantDataArgs(args, tenantId) : args);
          },
          update({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(
              tenantId ? withTenantMutationArgs(args, tenantId) : args,
            );
          },
          updateMany({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(
              tenantId ? withTenantMutationArgs(args, tenantId) : args,
            );
          },
          upsert({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(
              tenantId ? withTenantUpsertArgs(args, tenantId) : args,
            );
          },
          delete({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(tenantId ? withTenantWhereArgs(args, tenantId) : args);
          },
          deleteMany({ model, args, query }) {
            const tenantId = currentTenantId(model);
            return query(tenantId ? withTenantWhereArgs(args, tenantId) : args);
          },
        },
      },
    }) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
