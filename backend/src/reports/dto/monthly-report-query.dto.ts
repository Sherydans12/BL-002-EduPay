import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class MonthlyReportQueryDto {
  @ApiPropertyOptional({
    description: 'Fecha inicial de ingresos (ISO 8601)',
    example: '2026-06-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha final inclusiva de ingresos (ISO 8601)',
    example: '2026-06-30',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
