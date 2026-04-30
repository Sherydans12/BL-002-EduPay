import { IsString, IsNotEmpty, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGuardianDto {
  @ApiProperty({
    description: 'RUT del apoderado (único)',
    example: '12.345.678-9',
  })
  @IsString()
  @IsNotEmpty()
  rut: string;

  @ApiProperty({
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
}
