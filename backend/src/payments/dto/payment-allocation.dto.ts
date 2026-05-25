import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PaymentAllocationDto {
  @ApiProperty({ description: 'ID del alumno', example: 1 })
  @Type(() => Number)
  @IsInt()
  studentId: number;

  @ApiProperty({ description: 'ID del concepto de pago', example: 1 })
  @Type(() => Number)
  @IsInt()
  conceptId: number;

  @ApiProperty({ description: 'Monto asignado a este alumno (CLP)', example: 75000, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'El monto por alumno debe ser mayor a 0' })
  amount: number;
}
