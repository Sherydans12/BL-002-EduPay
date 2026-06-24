import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

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

  @ApiProperty({ example: '2026-06-23T15:30:00.000Z' })
  @IsDateString()
  paymentDate: string;

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
  installmentsIds: number[];
}
