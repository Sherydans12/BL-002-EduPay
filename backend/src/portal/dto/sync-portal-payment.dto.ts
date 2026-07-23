import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  Equals,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class SyncPortalPaymentDto {
  @ApiProperty({ example: 'OC-123', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  buyOrder: string;

  @ApiProperty({ example: 120000, minimum: 1 })
  @IsInt()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: [PaymentMethod.WEBPAY], example: PaymentMethod.WEBPAY })
  @Equals(PaymentMethod.WEBPAY)
  paymentMethod: PaymentMethod;

  @ApiProperty({ example: '1213', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  authorizationCode: string;

  @ApiProperty({ example: '6623', description: 'Últimos 4 dígitos' })
  @IsString()
  @Matches(/^\d{4}$/)
  cardNumber: string;

  @ApiProperty({
    type: [Number],
    example: [101, 102],
    description:
      'IDs numéricos de Charge. El esquema actual de EduPay no usa UUID para cuotas.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  chargeIds: number[];
}
