import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  Equals,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
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
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: [PaymentMethod.WEBPAY], example: PaymentMethod.WEBPAY })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const normalizedValue = value.trim().toUpperCase();
    return normalizedValue === 'WEBPAY_PLUS'
      ? PaymentMethod.WEBPAY
      : normalizedValue;
  })
  @IsString()
  @Equals(PaymentMethod.WEBPAY)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ example: '1213', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  authorizationCode?: string;

  @ApiPropertyOptional({
    example: '6623',
    description: 'Últimos 4 dígitos',
  })
  @Transform(({ value }) =>
    value === null || value === undefined || value === ''
      ? undefined
      : String(value).slice(-4),
  )
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  cardNumber?: string;

  @ApiProperty({
    type: [Number],
    example: [101, 102],
    description:
      'IDs numéricos de Charge. El esquema actual de EduPay no usa UUID para cuotas.',
  })
  @Type(() => Number)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  chargeIds: number[];
}
