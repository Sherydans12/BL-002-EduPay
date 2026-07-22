import { isTenantScopedModel } from './prisma.service';

describe('PrismaService tenant isolation', () => {
  it.each(['User', 'Tenant', 'Role', 'Permission'])(
    'no aplica el filtro tenant al modelo de sistema %s',
    (model) => {
      expect(isTenantScopedModel(model)).toBe(false);
    },
  );

  it.each(['Student', 'Course', 'Payment'])(
    'mantiene el aislamiento tenant para el modelo de negocio %s',
    (model) => {
      expect(isTenantScopedModel(model)).toBe(true);
    },
  );
});
