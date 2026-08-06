import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePortalGuardianEmailDto {
  @ApiProperty({
    description:
      'Nuevo correo ya verificado por el Portal. Se guarda sin espacios exteriores y en minúsculas.',
    example: 'nuevo.correo@example.cl',
    maxLength: 320,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({
    description:
      'Valor updatedAt recibido en la última lectura. Se usa para concurrencia optimista.',
    example: '2026-07-30T16:20:00.000Z',
    format: 'date-time',
  })
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  expectedUpdatedAt: string;
}
