import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Public } from '../../auth/decorators/public.decorator';
import { SuperAdminGuard } from '../../auth/guards/super-admin.guard';
import {
  AcademicFinancialProjectionAuthGuard,
  type AcademicFinancialProjectionRequest,
} from './academic-financial-projection-auth.guard';
import { AcademicFinancialProjectionReconciliationService } from './academic-financial-projection-reconciliation.service';
import { AcademicFinancialProjectionSnapshotService } from './academic-financial-projection-snapshot.service';
import { AcademicFinancialProjectionService } from './academic-financial-projection.service';
import { AcademicFinancialProjectionConfigService } from './academic-financial-projection-config.service';
import { AcademicFinancialProjectionWriterService } from './academic-financial-projection-writer.service';

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
    private readonly reconciliationReport: AcademicFinancialProjectionReconciliationService,
    private readonly writer: AcademicFinancialProjectionWriterService,
    private readonly config: AcademicFinancialProjectionConfigService,
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

  /**
   * Write plan (ADR-0027): what writing the shadow into BL would change, by
   * counts and enrollment ids. Runs the writes in a rolled-back transaction.
   */
  @Get('tenants/:tenantId/write-plan')
  writePlan(@Param('tenantId') tenantId: string) {
    return this.writer.run(tenantId, { dryRun: true });
  }

  /** Applies the write plan. Only with the write mode enabled. */
  @Post('tenants/:tenantId/write-plan/apply')
  applyWritePlan(@Param('tenantId') tenantId: string) {
    if (!this.config.writeEnabled()) {
      throw new ServiceUnavailableException(
        'Academic Financial Projection write mode is disabled.',
      );
    }
    return this.writer.run(tenantId, { dryRun: false });
  }

  /** Read-only v2 reconciliation against the legacy roster (ADR-0025). */
  @Get('tenants/:tenantId/legacy-comparison')
  legacyComparison(@Param('tenantId') tenantId: string) {
    return this.reconciliationReport.legacyReconciliation(tenantId);
  }
}
