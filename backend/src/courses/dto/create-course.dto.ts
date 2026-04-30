import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCourseDto {
  @ApiProperty({
    description: 'Nombre del curso',
    example: '1° Básico A',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}
