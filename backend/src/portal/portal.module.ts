import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { GuardianEmailWebhooksModule } from '../guardian-email-webhooks/guardian-email-webhooks.module';
import { PortalApiKeyMiddleware } from './portal-api-key.middleware';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [GuardianEmailWebhooksModule],
  controllers: [PortalController],
  providers: [PortalService, PortalApiKeyMiddleware],
})
export class PortalModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(PortalApiKeyMiddleware).forRoutes(PortalController);
  }
}
