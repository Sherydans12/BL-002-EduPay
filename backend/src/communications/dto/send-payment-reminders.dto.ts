import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class SendPaymentRemindersDto {
  @ApiPropertyOptional({
    description: 'Filtrar recordatorios por ID de curso',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;

  @ApiPropertyOptional({
    description: 'Filtrar recordatorio para un alumno específico',
    example: 274,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  studentId?: number;
}
