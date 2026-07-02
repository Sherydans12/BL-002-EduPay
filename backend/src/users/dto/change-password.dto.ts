import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres' })
  @Matches(/[a-z]/, {
    message: 'La nueva contraseña debe incluir al menos una minúscula',
  })
  @Matches(/[A-Z]/, {
    message: 'La nueva contraseña debe incluir al menos una mayúscula',
  })
  @Matches(/[0-9]/, {
    message: 'La nueva contraseña debe incluir al menos un número',
  })
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}
