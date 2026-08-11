import {
  IsString,
  IsNotEmpty,
  IsInt,
  Matches,
  IsEnum,
  IsOptional,
  MaxLength,
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
    description: 'Nombres validados del alumno',
    example: 'Juan Carlos',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({
    description: 'Apellidos validados del alumno',
    example: 'González Muñoz',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({
    description:
      'Nombre completo legacy. El servidor lo deriva desde firstName/lastName.',
    deprecated: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(201)
  name?: string;

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
