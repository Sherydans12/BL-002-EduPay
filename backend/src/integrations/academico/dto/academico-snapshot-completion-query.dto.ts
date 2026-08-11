import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class AcademicoSnapshotCompletionQueryDto {
  @ApiProperty({ description: 'Opaque token returned by GET /snapshot' })
  @IsString()
  @MaxLength(4096)
  snapshot: string;

  @ApiProperty({ description: 'Terminal Course watermark for this snapshot' })
  @IsString()
  @MaxLength(4096)
  courseWatermark: string;

  @ApiProperty({ description: 'Terminal Student watermark for this snapshot' })
  @IsString()
  @MaxLength(4096)
  studentWatermark: string;
}
