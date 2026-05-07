import { Module } from '@nestjs/common';
import { PaymentConceptsService } from './payment-concepts.service';
import { PaymentConceptsController } from './payment-concepts.controller';

@Module({
  controllers: [PaymentConceptsController],
  providers: [PaymentConceptsService],
  exports: [PaymentConceptsService],
})
export class PaymentConceptsModule {}
