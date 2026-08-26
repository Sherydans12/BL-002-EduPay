import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class MatrixReportQueryDto {
  @ApiPropertyOptional({
    description: 'Año escolar a consultar',
    example: 2026,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por ID de curso',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({
    description:
      'Filtrar por estado de alumno (ALL, OVERDUE, AL_DIA, SALDO_A_FAVOR)',
    example: 'OVERDUE',
  })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    description: 'Búsqueda por nombre de alumno, RUT o apoderado',
    example: 'González',
  })
  @IsOptional()
  search?: string;
}
