import { PartialType } from '@nestjs/swagger';
import { CreatePaymentConceptDto } from './create-payment-concept.dto';

export class UpdatePaymentConceptDto extends PartialType(CreatePaymentConceptDto) {}
