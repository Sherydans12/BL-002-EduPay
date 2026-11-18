import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { tenantContext } from '../../core/tenant/tenant.context';
import { AcademicFinancialProjectionIntakeService } from './academic-financial-projection-intake.service';

export class AcceptAcademicIntakeDto {
  @ApiPropertyOptional({
    description: 'Apoderado de la ficha nueva (de este colegio).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  guardianId?: number;

  @ApiPropertyOptional({
    description:
      'Alumno de Pagos con el mismo RUN que corresponde a esta ficha de Académico.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  existingStudentId?: number;
}

function currentTenantId(): string {
  const tenantId = tenantContext.getStore()?.tenantId;
  if (!tenantId) {
    throw new BadRequestException('Selecciona un colegio para continuar.');
  }
  return tenantId;
}

/** New students from Académico waiting for a guardian (ADR-0027). */
@ApiTags('academic-intake')
@ApiBearerAuth('access-token')
@Controller('academic-intake')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AcademicFinancialProjectionIntakeController {
  constructor(
    private readonly intake: AcademicFinancialProjectionIntakeService,
  ) {}

  @Get()
  @RequirePermissions('view:students')
  @ApiOperation({ summary: 'Alumnos nuevos desde Académico por incorporar' })
  list() {
    return this.intake.list(currentTenantId());
  }

  @Post(':academicStudentId/accept')
  @RequirePermissions('manage:students')
  @ApiOperation({
    summary:
      'Incorporar un alumno de Académico con su apoderado, o vincularlo a uno existente',
  })
  accept(
    @Param('academicStudentId', new ParseUUIDPipe()) academicStudentId: string,
    @Body() body: AcceptAcademicIntakeDto,
  ) {
    return this.intake.accept(currentTenantId(), academicStudentId, body);
  }
}
