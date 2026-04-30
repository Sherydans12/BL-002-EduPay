import { IsString, IsNotEmpty, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStudentDto {
  @ApiProperty({
    description: 'RUT del alumno (único)',
    example: '23.456.789-0',
  })
  @IsString()
  @IsNotEmpty()
  rut: string;

  @ApiProperty({
    description: 'Nombre completo del alumno',
    example: 'Juan González Muñoz',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'ID del curso al que pertenece',
    example: 1,
  })
  @IsInt()
  courseId: number;

  @ApiProperty({
    description: 'ID del apoderado / tutor',
    example: 1,
  })
  @IsInt()
  guardianId: number;
}
