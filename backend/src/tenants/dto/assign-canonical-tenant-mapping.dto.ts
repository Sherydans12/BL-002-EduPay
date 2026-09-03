import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignCanonicalTenantMappingDto {
  @ApiProperty({
    description:
      'UUID del TenantRealm canónico administrado por EduPay Identity',
    format: 'uuid',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUUID('4')
  canonicalTenantId: string;

  @ApiProperty({
    description: 'Motivo auditable de la asignación manual',
    maxLength: 500,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
