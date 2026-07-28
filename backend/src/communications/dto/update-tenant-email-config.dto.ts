import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  MinLength,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateTenantEmailConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  senderName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  replyToEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  emailFooter?: string | null;

  @IsOptional()
  @IsBoolean()
  enableManualPaymentEmails?: boolean;

  @IsOptional()
  @IsBoolean()
  enableBoletaEmails?: boolean;

  @IsOptional()
  @IsBoolean()
  enableReminderEmails?: boolean;
}
