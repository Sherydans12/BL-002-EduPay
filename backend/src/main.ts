import { RequestMethod } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as path from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggedValidationPipe } from './common/pipes/logged-validation.pipe';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);

  app.use(helmet());

  // Global prefix
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'webhooks/resend', method: RequestMethod.POST }],
  });

  // Global validation pipe
  app.useGlobalPipes(new LoggedValidationPipe());

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global transform interceptor
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));

  // ─── CORS ───────────────────────────────────────────────────
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const allowedOrigins = [
    process.env.PORTAL_URL,
    'https://demo.edupay.baselogic.cl',
    'https://portal.edupay.baselogic.cl',
    'http://localhost:3000',
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Tenant-ID',
    ],
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

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 EduPay API running on http://localhost:${port}/api`);
  if (!isProduction) {
    console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
