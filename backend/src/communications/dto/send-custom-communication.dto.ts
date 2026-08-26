import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendCustomCommunicationDto {
  @ApiProperty({
    description: 'Correo electrónico del destinatario',
    example: 'apoderado@ejemplo.com',
  })
  @IsEmail()
  @IsNotEmpty()
  recipientEmail: string;

  @ApiPropertyOptional({
    description: 'Nombre del destinatario',
    example: 'Carlos Santander',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientName?: string;

  @ApiProperty({
    description: 'Asunto de la comunicación',
    example: 'Información sobre proceso de matrícula 2026',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @ApiProperty({
    description: 'Cuerpo o mensaje del correo',
    example:
      'Estimado apoderado, le recordamos que los plazos de regularización...',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description: 'ID del alumno asociado (opcional)',
    example: 274,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  studentId?: number;

  @ApiPropertyOptional({
    description: 'ID del curso asociado (opcional)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  courseId?: number;
}
