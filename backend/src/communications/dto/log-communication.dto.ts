import {
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { CommunicationType, DeliveryStatus, type Prisma } from '@prisma/client';

export class LogCommunicationDto {
  @IsEmail()
  recipientEmail!: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsEnum(CommunicationType)
  type!: CommunicationType;

  @IsString()
  subject!: string;

  @IsEnum(DeliveryStatus)
  status!: DeliveryStatus;

  @IsOptional()
  @IsObject()
  metadata?: Prisma.InputJsonObject;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
