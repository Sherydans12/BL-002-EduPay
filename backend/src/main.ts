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

  // CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Servir archivos estáticos de /uploads
  const uploadDir = config.get<string>('UPLOAD_DIR') || './uploads';
  app.useStaticAssets(path.resolve(uploadDir), { prefix: '/uploads' });

  // ─── Swagger ────────────────────────────────────────────────
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
    .addTag('auth', 'Autenticación y login')
    .addTag('users', 'Gestión de usuarios')
    .addTag('roles', 'Gestión de roles y permisos')
    .addTag('courses', 'Gestión de cursos')
    .addTag('guardians', 'Gestión de apoderados / tutores')
    .addTag('students', 'Gestión de alumnos')
    .addTag('payments', 'Registro y consulta de pagos')
    .addTag('reports', 'Reportes y resúmenes')
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

  const port = config.get<number>('PORT') || 3001;
  await app.listen(port);
  console.log(`🚀 EduPay API running on http://localhost:${port}/api`);
  console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
