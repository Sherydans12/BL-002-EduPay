import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class TransbankWebhookDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  buyOrder: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sessionId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  status: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  authorizationCode: string;
}
