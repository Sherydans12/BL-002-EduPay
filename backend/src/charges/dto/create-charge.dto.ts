import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  Min,
  Matches,
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

export class PreviewEnrollmentFeesDto extends FinancialPlanChargeDto {
  @IsInt()
  @Min(1)
  academicYearId: number;

  @Min(50)
  declare amount: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  declare dueDate: string;
}

export class IssueEnrollmentFeesDto extends PreviewEnrollmentFeesDto {
  @Matches(/^[a-f0-9]{64}$/)
  fingerprint: string;
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
