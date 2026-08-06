import { Module } from '@nestjs/common';
import { GuardianEmailWebhooksModule } from '../guardian-email-webhooks/guardian-email-webhooks.module';
import { GuardiansService } from './guardians.service';
import { GuardiansController } from './guardians.controller';

@Module({
  imports: [GuardianEmailWebhooksModule],
  controllers: [GuardiansController],
  providers: [GuardiansService],
  exports: [GuardiansService],
})
export class GuardiansModule {}
