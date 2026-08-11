import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AcademicoFeedQueryDto {
  @ApiPropertyOptional({
    enum: ['incremental', 'full'],
    default: 'incremental',
  })
  @IsOptional()
  @IsString()
  mode?: string;

  @ApiPropertyOptional({ example: '1', default: '1' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  schemaVersion?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  limit?: string;

  @ApiPropertyOptional({ description: 'Opaque continuation cursor' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Opaque persisted incremental watermark',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  watermark?: string;

  @ApiPropertyOptional({
    description: 'Opaque token returned by GET /snapshot for full mode',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  snapshot?: string;
}
