import {
  IsInt,
  IsEnum,
  IsDateString,
  IsOptional,
  IsString,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type, Transform, plainToInstance } from 'class-transformer';
import { PaymentAllocationDto } from './payment-allocation.dto';

function parseAllocationsFromMultipart(value: unknown): unknown {
  const rows = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown[];
          } catch {
            return value;
          }
        })()
      : null;

  if (!Array.isArray(rows)) return value;

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return plainToInstance(PaymentAllocationDto, {
      studentId: Number(r.studentId),
      conceptId: Number(r.conceptId),
      amount: Number(r.amount),
      chargeId: r.chargeId == null ? undefined : Number(r.chargeId),
    });
  });
}

@ValidatorConstraint({ name: 'allocationsSumMatchesTotal', async: false })
class AllocationsSumMatchesTotalConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreatePaymentBatchDto;
    if (!dto.allocations?.length) return false;
    const sum = dto.allocations.reduce(
      (acc, row) => acc + Number(row.amount),
      0,
    );
    return sum === Number(dto.totalAmount);
  }

  defaultMessage(): string {
    return 'La suma de allocations[].amount debe ser exactamente igual a totalAmount';
  }
}

export class CreatePaymentBatchDto {
  @ApiProperty({
    description: 'Monto total del cobro (suma de todas las allocations)',
    example: 150000,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El monto total debe ser mayor a 0' })
  totalAmount: number;

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
    example: '2026-05-25',
  })
  @IsDateString(
    {},
    { message: 'Fecha de pago inválida. Use formato ISO 8601 (YYYY-MM-DD)' },
  )
  paymentDate: string;

  @ApiPropertyOptional({
    description:
      'URL del PDF de boleta (se asigna desde el upload en el controlador)',
    example: '/uploads/boleta-abc.pdf',
  })
  @IsOptional()
  @IsString()
  boletaFileUrl?: string;

  @ApiPropertyOptional({
    description: 'Número de la boleta emitida en SII',
    example: 'BOL-00587',
  })
  @IsOptional()
  @IsString()
  boletaNumber?: string;

  @ApiPropertyOptional({
    description: 'Notas u observaciones del cobro agrupado',
    example: 'Mensualidad mayo — 2 hijos',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    description: 'Distribución del monto por alumno (mínimo 1 línea)',
    type: [PaymentAllocationDto],
    example: [
      { studentId: 1, conceptId: 1, amount: 75000 },
      { studentId: 2, conceptId: 1, amount: 75000 },
    ],
  })
  @Transform(({ value }) => parseAllocationsFromMultipart(value))
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos una allocation (alumno)' })
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  @Validate(AllocationsSumMatchesTotalConstraint)
  allocations: PaymentAllocationDto[];
}
