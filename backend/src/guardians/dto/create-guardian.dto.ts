import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  Matches,
  IsArray,
  IsInt,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { formatRut } from '../../common/rut/rut.util';
import { IsValidChileanRut } from '../../common/rut/is-valid-rut.validator';

export class CreateGuardianDto {
  @ApiPropertyOptional({
    description: 'RUT del apoderado (único, opcional)',
    example: '12.345.678-9',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() ? formatRut(value) : undefined,
  )
  @IsString()
  @Matches(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/, {
    message: 'RUT inválido (formato: 12.345.678-9)',
  })
  @IsValidChileanRut()
  rut?: string;

  @ApiPropertyOptional({
    description: 'Nombre completo del apoderado',
    example: 'María González Pérez',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico',
    example: 'maria@ejemplo.cl',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Teléfono de contacto',
    example: '+56 9 8765 4321',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'IDs de alumnos a asociar a este apoderado',
    type: [Number],
    example: [1, 2],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  studentIds?: number[];
}
