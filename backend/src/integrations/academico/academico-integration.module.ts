import { Module } from '@nestjs/common';
import { AcademicoAuthGuard } from './academico-auth.guard';
import { AcademicoIntegrationConfigService } from './academico-integration-config.service';
import { AcademicoIntegrationController } from './academico-integration.controller';
import { AcademicoIntegrationService } from './academico-integration.service';
import { AcademicoObservabilityInterceptor } from './academico-observability.interceptor';
import { AcademicoRateLimitGuard } from './academico-rate-limit.guard';
import { AcademicoTokenCodecService } from './academico-token-codec.service';

@Module({
  controllers: [AcademicoIntegrationController],
  providers: [
    AcademicoIntegrationConfigService,
    AcademicoTokenCodecService,
    AcademicoIntegrationService,
    AcademicoAuthGuard,
    AcademicoRateLimitGuard,
    AcademicoObservabilityInterceptor,
  ],
})
export class AcademicoIntegrationModule {}
