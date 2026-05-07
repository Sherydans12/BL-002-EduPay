import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  @Get('export')
  @RequirePermissions('view:reports')
  @ApiOperation({ summary: 'Exportar reporte analítico a XLSX (multi-hoja)' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'courseId', required: false })
  @ApiResponse({ status: 200, description: 'Archivo XLSX con resumen, por método y por curso' })
  async exportXlsx(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('courseId') courseId: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.exportToXlsx(startDate, endDate, courseId);
    const date = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=reporte_${date}.xlsx`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

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
