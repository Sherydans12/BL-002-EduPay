import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ChargesService } from './charges.service';
import { SetupFinancialPlanDto } from './dto/create-charge.dto';

@Controller('charges')
export class ChargesController {
  constructor(private readonly chargesService: ChargesService) {}

  @Post('setup/:studentId')
  setupStudentFinancialPlan(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() dto: SetupFinancialPlanDto,
  ) {
    return this.chargesService.setupStudentFinancialPlan(studentId, dto);
  }
}
