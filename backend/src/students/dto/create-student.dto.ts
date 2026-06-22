import {
  IsString,
  IsNotEmpty,
  IsInt,
  Matches,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StudentStatus } from '@prisma/client';
import { formatRut } from '../../common/rut/rut.util';
import { IsValidChileanRut } from '../../common/rut/is-valid-rut.validator';

export class CreateStudentDto {
  @ApiProperty({
    description: 'RUT del alumno (único)',
    example: '23.456.789-0',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? formatRut(value) : value,
  )
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/, {
    message: 'RUT inválido (formato: 12.345.678-9)',
  })
  @IsValidChileanRut()
  rut: string;

  @ApiProperty({
    description: 'Nombre completo del alumno',
    example: 'Juan González Muñoz',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'ID del curso al que pertenece',
    example: 1,
  })
  @IsInt()
  courseId: number;

  @ApiProperty({
    description: 'ID del apoderado / tutor',
    example: 1,
  })
  @IsInt()
  guardianId: number;

  @ApiPropertyOptional({
    description: 'Estado de matrícula del alumno',
    enum: StudentStatus,
    default: StudentStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
