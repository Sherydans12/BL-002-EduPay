import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FinancialPlanChargeDto {
  @IsInt()
  @Min(1)
  conceptId: number;

  @IsInt()
  @Min(1)
  amount: number;

  @IsDateString()
  dueDate: string;
}

export class SetupFinancialPlanDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FinancialPlanChargeDto)
  charges: FinancialPlanChargeDto[];
}

export class CreateChargeDto extends FinancialPlanChargeDto {}
