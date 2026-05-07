import { IsString, IsInt, IsOptional, IsBoolean, MinLength, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentConceptDto {
  @ApiProperty({
    description: 'Nombre del concepto de pago (único)',
    example: 'Mensualidad General',
    minLength: 2,
    maxLength: 150,
  })
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(150, { message: 'El nombre no puede superar 150 caracteres' })
  name: string;

  @ApiProperty({
    description: 'Monto por defecto en pesos chilenos (entero)',
    example: 75000,
    minimum: 1,
  })
  @IsInt()
  @Min(1, { message: 'El monto por defecto debe ser mayor a 0' })
  defaultAmount: number;

  @ApiPropertyOptional({
    description: 'Indica si el concepto está activo',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
