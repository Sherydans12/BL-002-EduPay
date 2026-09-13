import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Public } from '../../auth/decorators/public.decorator';
import { SuperAdminGuard } from '../../auth/guards/super-admin.guard';
import {
  AcademicFinancialProjectionAuthGuard,
  type AcademicFinancialProjectionRequest,
} from './academic-financial-projection-auth.guard';
import { AcademicFinancialProjectionSnapshotService } from './academic-financial-projection-snapshot.service';
import { AcademicFinancialProjectionService } from './academic-financial-projection.service';

@Public()
@ApiTags('academic-financial-projection-shadow')
@Controller('integrations/academic-financial-projection')
export class AcademicFinancialProjectionConsumerController {
  constructor(
    private readonly projection: AcademicFinancialProjectionService,
  ) {}

  @Post('events')
  @UseGuards(AcademicFinancialProjectionAuthGuard)
  consume(
    @Body() body: unknown,
    @Req() request: AcademicFinancialProjectionRequest,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.projection.consume(
      body,
      request.academicFinancialProjectionPrincipal!.canonicalTenantId,
      correlationId,
    );
  }
}

@ApiTags('academic-financial-projection-shadow')
@ApiBearerAuth('access-token')
@UseGuards(SuperAdminGuard)
@Controller('integrations/academic-financial-projection/shadow')
export class AcademicFinancialProjectionShadowAdminController {
  constructor(
    private readonly snapshots: AcademicFinancialProjectionSnapshotService,
    private readonly projection: AcademicFinancialProjectionService,
  ) {}

  @Post('tenants/:tenantId/snapshots')
  bootstrap(@Param('tenantId') tenantId: string) {
    return this.snapshots.bootstrap(tenantId);
  }

  @Post('tenants/:tenantId/snapshots/:snapshotId/resume')
  resume(
    @Param('tenantId') tenantId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.snapshots.resume(tenantId, snapshotId);
  }

  @Get('tenants/:tenantId/snapshots/:snapshotId/reconciliation')
  reconciliation(
    @Param('tenantId') tenantId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.projection.reconcileSnapshot(tenantId, snapshotId);
  }

  @Get('tenants/:tenantId/legacy-comparison')
  legacyComparison(@Param('tenantId') tenantId: string) {
    return this.projection.legacyComparison(tenantId);
  }
}
