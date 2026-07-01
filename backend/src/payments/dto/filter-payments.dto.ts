import { PaymentMethod } from '@prisma/client';
import { IsOptional, IsDateString, IsInt, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FilterPaymentsDto {
  @ApiPropertyOptional({
    description: 'Fecha inicio del rango de búsqueda (ISO 8601)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Fecha fin del rango de búsqueda (ISO 8601)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de curso',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de alumno',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  studentId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por método de pago',
    enum: PaymentMethod,
    example: PaymentMethod.TRANSFER,
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({
    description: 'Número de página (paginación)',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Cantidad de resultados por página',
    example: 20,
    default: 50,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
