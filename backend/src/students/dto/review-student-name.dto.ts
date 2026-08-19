import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReviewStudentNameDto {
  @ApiProperty({
    description: 'Nombres del alumno (partición validada)',
    example: 'Vicente',
  })
  @IsString()
  @IsNotEmpty({ message: 'El campo Nombres no puede estar vacío' })
  @MaxLength(100, { message: 'El campo Nombres no debe superar los 100 caracteres' })
  firstName!: string;

  @ApiProperty({
    description: 'Apellidos del alumno (partición validada)',
    example: 'Escobar Marín',
  })
  @IsString()
  @IsNotEmpty({ message: 'El campo Apellidos no puede estar vacío' })
  @MaxLength(100, { message: 'El campo Apellidos no debe superar los 100 caracteres' })
  lastName!: string;
}
