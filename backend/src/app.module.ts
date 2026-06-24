import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { CoursesModule } from './courses/courses.module';
import { GuardiansModule } from './guardians/guardians.module';
import { StudentsModule } from './students/students.module';
import { PaymentsModule } from './payments/payments.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { ReportsModule } from './reports/reports.module';
import { PaymentConceptsModule } from './payment-concepts/payment-concepts.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AppController } from './app.controller';
import { ChargesModule } from './charges/charges.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BillingCronService } from './billing-cron/billing-cron.service';
import { AnalyticsModule } from './analytics/analytics.module';
import { PortalModule } from './portal/portal.module';
import { TenantMiddleware } from './core/tenant/tenant.middleware';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    ReportsModule,
    CoursesModule,
    GuardiansModule,
    StudentsModule,
    PaymentsModule,
    PaymentConceptsModule,
    MailModule,
    ChargesModule,
    NotificationsModule,
    AnalyticsModule,
    PortalModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    BillingCronService,
    TenantMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
