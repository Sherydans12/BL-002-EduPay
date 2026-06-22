import {
  IsInt,
  IsEnum,
  IsDateString,
  IsOptional,
  IsString,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Transform } from 'class-transformer';

export class CreatePaymentDto {
  @ApiProperty({
    description: 'Monto del pago en pesos chilenos (entero, sin decimales)',
    example: 75000,
    minimum: 1,
  })
  @IsInt()
  @Min(1, { message: 'El monto debe ser mayor a 0' })
  amount: number;

  @ApiProperty({
    description: 'Método de pago utilizado',
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
    example: 'CASH',
  })
  @IsEnum(PaymentMethod, {
    message: `Método de pago inválido. Valores permitidos: ${Object.values(PaymentMethod).join(', ')}`,
  })
  method: PaymentMethod;

  @ApiProperty({
    description: 'Fecha en que se realizó el pago (ISO 8601)',
    example: '2026-04-30',
  })
  @IsDateString(
    {},
    { message: 'Fecha de pago inválida. Use formato ISO 8601 (YYYY-MM-DD)' },
  )
  paymentDate: string;

  @ApiProperty({
    description: 'ID del alumno asociado al pago',
    example: 1,
  })
  @IsInt()
  studentId: number;

  @ApiPropertyOptional({
    description:
      'Nombre del pagador alternativo. Si es null, se asume que pagó el apoderado.',
    example: 'Pedro Soto',
  })
  @IsOptional()
  @IsString()
  payerName?: string;

  @ApiPropertyOptional({
    description: 'RUT del pagador alternativo (formato chileno)',
    example: '11.222.333-4',
  })
  @IsOptional()
  @IsString()
  payerRut?: string;

  @ApiPropertyOptional({
    description:
      'Código de referencia de la transacción (ej. N° de operación bancaria)',
    example: 'TRX-2026-00142',
  })
  @IsOptional()
  @IsString()
  referenceCode?: string;

  @ApiPropertyOptional({
    description: 'Notas u observaciones adicionales',
    example: 'Pago parcial del mes de abril',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Número de la boleta emitida en SII',
    example: 'BOL-00587',
  })
  @IsOptional()
  @IsString()
  boletaNumber?: string;

  @ApiPropertyOptional({
    description:
      'Indica que la boleta quedará pendiente de emisión/carga posterior',
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
    description: 'ID del concepto de pago (ej. Mensualidad, Matrícula)',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  conceptId?: number;
}
