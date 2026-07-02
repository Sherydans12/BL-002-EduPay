import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class UpdatePaymentGroupDto {
  @ApiPropertyOptional({
    description: 'Método de pago utilizado',
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
    example: 'TRANSFER',
  })
  @IsOptional()
  @IsEnum(PaymentMethod, {
    message: `Método de pago inválido. Valores permitidos: ${Object.values(PaymentMethod).join(', ')}`,
  })
  method?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Fecha del pago (YYYY-MM-DD)',
    example: '2026-06-01',
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'Fecha de pago inválida. Use formato ISO 8601 (YYYY-MM-DD)' },
  )
  paymentDate?: string;

  @ApiPropertyOptional({
    description: 'Número de la boleta emitida en SII',
    example: 'BOL-00587',
  })
  @IsOptional()
  @IsString()
  boletaNumber?: string;

  @ApiPropertyOptional({
    description: 'Indica si la transacción queda pendiente de boleta',
    example: true,
  })
  @Transform(({ value }) =>
    value == null || value === ''
      ? undefined
      : value === true || value === 'true',
  )
  @IsOptional()
  @IsBoolean()
  isBoletaPending?: boolean;

  @ApiPropertyOptional({
    description: 'Notas u observaciones del cobro',
    example: 'Pago histórico regularizado',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
