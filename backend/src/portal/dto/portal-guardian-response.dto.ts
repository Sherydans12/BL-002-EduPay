import { ApiProperty } from '@nestjs/swagger';

export class PortalGuardianLookupDataDto {
  @ApiProperty({ example: true })
  exists: boolean;

  @ApiProperty({ example: 42, nullable: true, type: Number })
  id: number | null;

  @ApiProperty({ example: '12.345.678-5', nullable: true, type: String })
  rut: string | null;

  @ApiProperty({
    example: 'María González Pérez',
    nullable: true,
    type: String,
  })
  name: string | null;

  @ApiProperty({
    example: 'maria.gonzalez@example.cl',
    nullable: true,
    type: String,
  })
  email: string | null;

  @ApiProperty({
    example: '2026-07-30T16:20:00.000Z',
    nullable: true,
    type: String,
    format: 'date-time',
  })
  updatedAt: Date | null;
}

export class PortalGuardianLookupResponseDto {
  @ApiProperty({ type: PortalGuardianLookupDataDto })
  data: PortalGuardianLookupDataDto;
}

export class PortalGuardianEmailUpdatedDataDto {
  @ApiProperty({ example: 42 })
  id: number;

  @ApiProperty({ example: '12.345.678-5', nullable: true, type: String })
  rut: string | null;

  @ApiProperty({ example: 'María González Pérez' })
  name: string;

  @ApiProperty({ example: 'nuevo.correo@example.cl' })
  email: string;

  @ApiProperty({
    example: '2026-07-30T16:25:00.000Z',
    format: 'date-time',
  })
  updatedAt: Date;
}

export class PortalGuardianEmailUpdatedResponseDto {
  @ApiProperty({ type: PortalGuardianEmailUpdatedDataDto })
  data: PortalGuardianEmailUpdatedDataDto;
}

export class PortalApiErrorResponseDto {
  @ApiProperty({ example: 409 })
  statusCode: number;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: 'El apoderado fue modificado recientemente' },
      {
        type: 'array',
        items: { type: 'string' },
        example: ['email must be an email'],
      },
    ],
  })
  message: string | string[];

  @ApiProperty({
    example: '2026-07-30T16:25:00.000Z',
    format: 'date-time',
  })
  timestamp: string;

  @ApiProperty({
    example: '/api/v1/portal/guardian/12.345.678-5/email',
  })
  path: string;
}
