import { Module } from '@nestjs/common';
import { GuardianEmailWebhooksService } from './guardian-email-webhooks.service';

@Module({
  providers: [GuardianEmailWebhooksService],
  exports: [GuardianEmailWebhooksService],
})
export class GuardianEmailWebhooksModule {}
