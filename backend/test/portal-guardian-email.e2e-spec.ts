import { INestApplication } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import request from 'supertest';
import { App } from 'supertest/types';
import { createE2eApp } from './helpers/create-e2e-app';
import { seedE2eDatabase } from './helpers/seed-e2e-db';

describe('Portal guardian email S2S (e2e)', () => {
  const tenantId = 'colegio-conquistadores';
  const portalKey = 'e2e-portal-key-for-conquistadores';
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const authorized = (method: 'get' | 'patch', path: string) =>
    request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${portalKey}`)
      .set('x-tenant-id', tenantId);

  beforeAll(async () => {
    process.env.PORTAL_TENANT_KEYS = JSON.stringify({
      [tenantId]: portalKey,
      'colegio-pruebas': 'other-tenant-key',
    });
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const authService = app.get(AuthService);
    await seedE2eDatabase(prisma, (email, password) =>
      authService.login(email, password),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('consulta id, email y updatedAt', async () => {
    const response = await authorized(
      'get',
      '/api/v1/portal/guardian/11.111.111-1',
    ).expect(200);

    expect(response.body.data).toEqual({
      exists: true,
      id: expect.any(Number),
      rut: '11.111.111-1',
      name: 'Apoderado E2E',
      email: 'apoderado.e2e@example.com',
      updatedAt: expect.any(String),
    });
  });

  it('rechaza email inválido y propiedades adicionales', async () => {
    const lookup = await authorized(
      'get',
      '/api/v1/portal/guardian/11.111.111-1',
    ).expect(200);

    await authorized('patch', '/api/v1/portal/guardian/11.111.111-1/email')
      .send({
        email: 'correo-invalido',
        expectedUpdatedAt: lookup.body.data.updatedAt,
      })
      .expect(400);

    const extraProperty = await authorized(
      'patch',
      '/api/v1/portal/guardian/11.111.111-1/email',
    )
      .send({
        email: 'nuevo@example.cl',
        expectedUpdatedAt: lookup.body.data.updatedAt,
        name: 'No permitido',
      })
      .expect(400);
    expect(String(extraProperty.body.message)).toContain(
      'property name should not exist',
    );
  });

  it('rechaza una API key incorrecta o de otro tenant', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/portal/guardian/11.111.111-1')
      .set('Authorization', 'Bearer other-tenant-key')
      .set('x-tenant-id', tenantId)
      .expect(401);
  });

  it('retorna 404 para un apoderado inexistente', async () => {
    const response = await authorized(
      'get',
      '/api/v1/portal/guardian/12.345.678-5',
    ).expect(200);
    expect(response.body.data.exists).toBe(false);

    await authorized('patch', '/api/v1/portal/guardian/12.345.678-5/email')
      .send({
        email: 'nuevo@example.cl',
        expectedUpdatedAt: '2026-07-30T16:20:00.000Z',
      })
      .expect(404);
  });

  it('actualiza el correo, lo normaliza y crea la outbox', async () => {
    const lookup = await authorized(
      'get',
      '/api/v1/portal/guardian/11.111.111-1',
    ).expect(200);

    const response = await authorized(
      'patch',
      '/api/v1/portal/guardian/11.111.111-1/email',
    )
      .send({
        email: '  Nuevo.Correo@Example.CL  ',
        expectedUpdatedAt: lookup.body.data.updatedAt,
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: lookup.body.data.id,
      rut: '11.111.111-1',
      name: 'Apoderado E2E',
      email: 'nuevo.correo@example.cl',
      updatedAt: expect.any(String),
    });
    expect(response.body.data.updatedAt).not.toBe(lookup.body.data.updatedAt);

    const event = await prisma.guardianEmailWebhookEvent.findFirst({
      where: {
        guardianId: lookup.body.data.id,
        source: 'PORTAL',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(event).toMatchObject({
      tenantId,
      email: 'nuevo.correo@example.cl',
      previousEmail: 'apoderado.e2e@example.com',
      actorId: 'portal-s2s',
      status: 'PENDING',
    });
  });

  it('responde 409 si expectedUpdatedAt quedó desactualizado', async () => {
    const lookup = await authorized(
      'get',
      '/api/v1/portal/guardian/11.111.111-1',
    ).expect(200);
    await prisma.guardian.update({
      where: { id: lookup.body.data.id },
      data: { name: 'Apoderado modificado concurrentemente' },
    });

    await authorized('patch', '/api/v1/portal/guardian/11.111.111-1/email')
      .send({
        email: 'conflicto@example.cl',
        expectedUpdatedAt: lookup.body.data.updatedAt,
      })
      .expect(409);
  });

  it('permite que dos apoderados compartan correo', async () => {
    await prisma.guardian.create({
      data: {
        rut: '12.345.678-5',
        name: 'Segundo Apoderado E2E',
        email: 'compartido@example.cl',
      },
    });
    const lookup = await authorized(
      'get',
      '/api/v1/portal/guardian/11.111.111-1',
    ).expect(200);

    const response = await authorized(
      'patch',
      '/api/v1/portal/guardian/11.111.111-1/email',
    )
      .send({
        email: 'compartido@example.cl',
        expectedUpdatedAt: lookup.body.data.updatedAt,
      })
      .expect(200);
    expect(response.body.data.email).toBe('compartido@example.cl');
  });
});
