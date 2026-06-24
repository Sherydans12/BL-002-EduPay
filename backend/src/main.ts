import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as path from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global transform interceptor
  app.useGlobalInterceptors(new TransformInterceptor());

  // ─── CORS ───────────────────────────────────────────────────
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const frontendUrl = config.get<string>('FRONTEND_URL');

  if (isProduction && !frontendUrl) {
    console.error(
      '[bootstrap] FATAL: FRONTEND_URL no está definido en producción. ' +
        'CORS denegará todos los orígenes cross-origin.',
    );
  }

  app.enableCors({
    origin: isProduction
      ? (frontendUrl ?? false)
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
          ...(frontendUrl ? [frontendUrl] : []),
        ],
    credentials: true,
  });

  // ─── Archivos estáticos (uploads) ────────────────────────────
  const uploadDir = path.resolve(
    process.cwd(),
    config.get<string>('UPLOAD_DIR') || 'uploads',
  );
  // Mismo prefijo que usa el frontend: NEXT_PUBLIC_API_URL + boletaFileUrl (/uploads/…)
  app.useStaticAssets(uploadDir, { prefix: '/api/uploads' });

  // ─── Swagger (solo fuera de producción) ──────────────────────
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('EduPay API')
      .setDescription(
        'API del sistema de registro manual de pagos para colegios. ' +
          'Proyecto BaseLogic BL-002.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: 'Valor de EDUPAY_API_KEY para comunicación S2S',
        },
        'portal-api-key',
      )
      .addTag('auth', 'Autenticación y login')
      .addTag('users', 'Gestión de usuarios')
      .addTag('roles', 'Gestión de roles y permisos')
      .addTag('courses', 'Gestión de cursos')
      .addTag('guardians', 'Gestión de apoderados / tutores')
      .addTag('students', 'Gestión de alumnos')
      .addTag('payments', 'Registro y consulta de pagos')
      .addTag('reports', 'Reportes y resúmenes')
      .addTag('portal', 'Integración Server-to-Server con el Portal de Pagos')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        tagsSorter: 'alpha',
      },
      customSiteTitle: 'EduPay API Docs',
    });
  }

  // Evita 404 en logs cuando el navegador pide el favicon contra el puerto de la API
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get(
    '/favicon.ico',
    (_req: unknown, res: { status: (n: number) => { end: () => void } }) =>
      res.status(204).end(),
  );

  const port = config.get<number>('PORT') || 3001;
  await app.listen(port);
  console.log(`🚀 EduPay API running on http://localhost:${port}/api`);
  if (!isProduction) {
    console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
