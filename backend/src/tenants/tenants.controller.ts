import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Headers,
  Param,
  ParseBoolPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { AssignCanonicalTenantMappingDto } from './dto/assign-canonical-tenant-mapping.dto';
import { TenantsService } from './tenants.service';

@ApiTags('tenants')
@ApiBearerAuth('access-token')
@UseGuards(SuperAdminGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar colegios activos para SUPER_ADMIN' })
  findActive() {
    return this.tenantsService.findActive();
  }

  @Get(':tenantId/canonical-mapping')
  @ApiOperation({
    summary: 'Consultar el mapeo explícito de tenant local a tenant canónico',
  })
  @ApiParam({ name: 'tenantId', description: 'PK local de BL' })
  @ApiResponse({ status: 404, description: 'El tenant o su mapeo no existe' })
  findCanonicalMapping(@Param('tenantId') tenantId: string) {
    return this.tenantsService.findCanonicalMapping(tenantId);
  }

  @Post(':tenantId/canonical-mapping')
  @ApiOperation({
    summary: 'Asignar de forma auditable el UUID canónico de un tenant local',
    description:
      'Operación de configuración exclusiva de SUPER_ADMIN. No es un selector de tenant para clientes ni contratos operacionales.',
  })
  @ApiParam({ name: 'tenantId', description: 'PK local de BL' })
  @ApiQuery({
    name: 'dryRun',
    required: false,
    type: Boolean,
    description: 'Valida el par y las colisiones sin crear una fila',
  })
  @ApiResponse({
    status: 201,
    description: 'Mapeo creado o resultado idempotente',
  })
  @ApiResponse({
    status: 409,
    description: 'El tenant o UUID canónico ya tiene otro mapeo',
  })
  assignCanonicalMapping(
    @Param('tenantId') tenantId: string,
    @Body() dto: AssignCanonicalTenantMappingDto,
    @Req() request: { user?: { id?: string } },
    @Headers('x-correlation-id') correlationId?: string,
    @Query('dryRun', new DefaultValuePipe(false), ParseBoolPipe)
    dryRun?: boolean,
  ) {
    return this.tenantsService.assignCanonicalMapping({
      tenantId,
      canonicalTenantId: dto.canonicalTenantId,
      reason: dto.reason,
      assignedByUserId: request.user?.id,
      correlationId,
      dryRun,
    });
  }
}
