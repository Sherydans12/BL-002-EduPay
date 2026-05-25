import { Module, OnModuleInit } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule implements OnModuleInit {
  constructor(private readonly paymentsService: PaymentsService) {}

  async onModuleInit() {
    await this.paymentsService.migrateLegacyPayments();
  }
}
