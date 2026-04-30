import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @RequirePermissions('view:reports')
  @ApiOperation({ summary: 'Obtener resumen de pagos recaudados' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Fecha de inicio (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Fecha de fin (ISO 8601)' })
  @ApiQuery({ name: 'courseId', required: false, description: 'ID del curso para filtrar' })
  @ApiResponse({ status: 200, description: 'Resumen calculado correctamente.' })
  getSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('courseId') courseId?: string,
  ) {
    return this.reportsService.getSummary(startDate, endDate, courseId);
  }
}
