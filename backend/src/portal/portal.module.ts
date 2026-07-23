import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PortalApiKeyMiddleware } from './portal-api-key.middleware';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PortalController],
  providers: [PortalService, PortalApiKeyMiddleware],
})
export class PortalModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(PortalApiKeyMiddleware).forRoutes(PortalController);
  }
}
