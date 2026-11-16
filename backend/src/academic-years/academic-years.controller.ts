import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AcademicYearsService } from './academic-years.service';

@ApiTags('academic-years')
@Controller('academic-years')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AcademicYearsController {
  constructor(private readonly academicYears: AcademicYearsService) {}

  @Get()
  @RequirePermissions('view:courses')
  @ApiOperation({
    summary: 'Años académicos del colegio, del más reciente al más antiguo',
  })
  list() {
    return this.academicYears.list();
  }
}
