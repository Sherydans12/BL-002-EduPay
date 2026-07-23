import { IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AttachBoletaDto {
  @ApiPropertyOptional({
    description:
      'URL pública de la boleta PDF. Se puede enviar en lugar del archivo multipart.',
    example: 'https://archivos.ejemplo.cl/boletas/BOL-00587.pdf',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(https?:\/\/|\/uploads\/).+\.pdf(?:\?.*)?$/i, {
    message:
      'boletaFileUrl debe ser una URL HTTP(S) o una ruta /uploads que apunte a un PDF',
  })
  boletaFileUrl?: string;
}
