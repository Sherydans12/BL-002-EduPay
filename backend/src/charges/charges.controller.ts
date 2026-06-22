import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ChargesService } from './charges.service';
import {
  SetupFinancialPlanDto,
  UpdateFinancialPlanDto,
} from './dto/create-charge.dto';

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

  @Get('plan/:studentId')
  findPlanByStudent(@Param('studentId', ParseIntPipe) studentId: number) {
    return this.chargesService.findPlanByStudent(studentId);
  }

  @Put('plan/:studentId')
  updateStudentFinancialPlan(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() dto: UpdateFinancialPlanDto,
  ) {
    return this.chargesService.updateStudentFinancialPlan(studentId, dto);
  }

  @Get('pending/:studentId')
  findPendingByStudent(@Param('studentId', ParseIntPipe) studentId: number) {
    return this.chargesService.findPendingByStudent(studentId);
  }
}
