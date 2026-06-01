import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './helpers/create-e2e-app';
import { seedE2eDatabase, type E2eSeedContext } from './helpers/seed-e2e-db';

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ctx: E2eSeedContext;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const authService = app.get(AuthService);
    ctx = await seedE2eDatabase(prisma, (email, password) =>
      authService.login(email, password),
    );
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/payments/batch acepta multipart con montos en string', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/payments/batch')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .field('totalAmount', '75000')
      .field('method', 'CASH')
      .field('paymentDate', '2026-06-01')
      .field(
        'allocations',
        JSON.stringify([
          {
            studentId: String(ctx.studentId),
            conceptId: String(ctx.conceptId),
            amount: '75000',
          },
        ]),
      )
      .expect(201);

    expect(res.body.data).toMatchObject({
      totalAmount: 75000,
      method: 'CASH',
    });
    expect(res.body.data.payments).toHaveLength(1);
    expect(res.body.data.payments[0]).toMatchObject({
      amount: 75000,
      studentId: ctx.studentId,
      conceptId: ctx.conceptId,
    });
  });

  it('POST /api/payments/batch rechaza suma de allocations distinta a totalAmount', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/payments/batch')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .field('totalAmount', '80000')
      .field('method', 'CASH')
      .field('paymentDate', '2026-06-01')
      .field(
        'allocations',
        JSON.stringify([
          {
            studentId: ctx.studentId,
            conceptId: ctx.conceptId,
            amount: '75000',
          },
        ]),
      )
      .expect(400);

    const message = res.body.message;
    const text = Array.isArray(message) ? message.join(' ') : String(message);
    expect(text).toMatch(/totalAmount|allocations/i);
  });

  it('POST /api/payments/batch registra cobro agrupado de dos alumnos', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/payments/batch')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .field('totalAmount', '150000')
      .field('method', 'TRANSFER')
      .field('paymentDate', '2026-06-02')
      .field(
        'allocations',
        JSON.stringify([
          {
            studentId: String(ctx.studentId),
            conceptId: String(ctx.conceptId),
            amount: '75000',
          },
          {
            studentId: String(ctx.student2Id),
            conceptId: String(ctx.conceptId),
            amount: '75000',
          },
        ]),
      )
      .field('boletaNumber', 'BOL-E2E-001')
      .expect(201);

    expect(res.body.data.totalAmount).toBe(150000);
    expect(res.body.data.payments).toHaveLength(2);
    expect(res.body.data.boletaNumber).toBe('BOL-E2E-001');
  });

  it('GET /api/payments/groups lista transacciones registradas', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/payments/groups')
      .set('Authorization', `Bearer ${ctx.accessToken}`)
      .expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });

  it('POST /api/payments/batch sin token responde 401', async () => {
    await request(app.getHttpServer())
      .post('/api/payments/batch')
      .field('totalAmount', '1000')
      .field('method', 'CASH')
      .field('paymentDate', '2026-06-01')
      .field(
        'allocations',
        JSON.stringify([
          { studentId: ctx.studentId, conceptId: ctx.conceptId, amount: 1000 },
        ]),
      )
      .expect(401);
  });
});
