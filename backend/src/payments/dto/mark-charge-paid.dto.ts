import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class MarkChargePaidDto {
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
    description: 'Fecha en que se reconoce el pago (YYYY-MM-DD)',
    example: '2026-06-01',
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'Fecha de pago inválida. Use formato ISO 8601 (YYYY-MM-DD)' },
  )
  paymentDate?: string;

  @ApiPropertyOptional({
    description: 'Observación interna del pago rápido',
    example: 'Pago histórico cargado desde respaldo físico',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
