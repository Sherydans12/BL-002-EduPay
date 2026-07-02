import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
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

export class FinancialPlanPaymentAllocationDto {
  @IsInt()
  @Min(1)
  paymentId: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  chargeIndex?: number | null;
}

export class SetupFinancialPlanDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FinancialPlanChargeDto)
  charges: FinancialPlanChargeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinancialPlanPaymentAllocationDto)
  paymentAllocations?: FinancialPlanPaymentAllocationDto[];
}

export class UpdateFinancialPlanChargeDto extends FinancialPlanChargeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;
}

export class UpdateFinancialPlanDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateFinancialPlanChargeDto)
  charges: UpdateFinancialPlanChargeDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinancialPlanPaymentAllocationDto)
  paymentAllocations?: FinancialPlanPaymentAllocationDto[];
}

export class CreateChargeDto extends FinancialPlanChargeDto {}
