import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ChargesService } from './charges.service';
import {
  SetupFinancialPlanDto,
  UpdateFinancialPlanDto,
} from './dto/create-charge.dto';

@Controller('charges')
export class ChargesController {
  constructor(private readonly chargesService: ChargesService) {}

  /**
   * Plans belong to an enrollment (student + academic year). Without
   * `academicYearId` the endpoints use the ACTIVE academic year.
   */
  @Post('setup/:studentId')
  setupStudentFinancialPlan(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() dto: SetupFinancialPlanDto,
    @Query('academicYearId', new ParseIntPipe({ optional: true }))
    academicYearId?: number,
  ) {
    return this.chargesService.setupStudentFinancialPlan(
      studentId,
      dto,
      academicYearId,
    );
  }

  @Get('plan/:studentId')
  findPlanByStudent(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query('academicYearId', new ParseIntPipe({ optional: true }))
    academicYearId?: number,
  ) {
    return this.chargesService.findPlanByStudent(studentId, academicYearId);
  }

  /** Without `academicYearId` the statement covers every year. */
  @Get('statement/:studentId')
  getStudentAccountStatement(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query('academicYearId', new ParseIntPipe({ optional: true }))
    academicYearId?: number,
  ) {
    return this.chargesService.getStudentAccountStatement(
      studentId,
      academicYearId,
    );
  }

  @Put('plan/:studentId')
  updateStudentFinancialPlan(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Body() dto: UpdateFinancialPlanDto,
    @Query('academicYearId', new ParseIntPipe({ optional: true }))
    academicYearId?: number,
  ) {
    return this.chargesService.updateStudentFinancialPlan(
      studentId,
      dto,
      academicYearId,
    );
  }

  @Get('pending/:studentId')
  findPendingByStudent(@Param('studentId', ParseIntPipe) studentId: number) {
    return this.chargesService.findPendingByStudent(studentId);
  }
}
