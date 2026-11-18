import { Module } from '@nestjs/common';

import { AcademicFinancialProjectionAuthGuard } from './academic-financial-projection-auth.guard';
import { AcademicFinancialProjectionConfigService } from './academic-financial-projection-config.service';
import {
  AcademicFinancialProjectionConsumerController,
  AcademicFinancialProjectionShadowAdminController,
} from './academic-financial-projection.controller';
import { AcademicFinancialProjectionReconciliationService } from './academic-financial-projection-reconciliation.service';
import { AcademicFinancialProjectionSnapshotService } from './academic-financial-projection-snapshot.service';
import { AcademicFinancialProjectionService } from './academic-financial-projection.service';
import { AcademicFinancialProjectionWriterService } from './academic-financial-projection-writer.service';
import { AcademicFinancialProjectionIntakeService } from './academic-financial-projection-intake.service';
import { AcademicFinancialProjectionIntakeController } from './academic-financial-projection-intake.controller';

@Module({
  controllers: [
    AcademicFinancialProjectionConsumerController,
    AcademicFinancialProjectionShadowAdminController,
    AcademicFinancialProjectionIntakeController,
  ],
  providers: [
    AcademicFinancialProjectionConfigService,
    AcademicFinancialProjectionAuthGuard,
    AcademicFinancialProjectionService,
    AcademicFinancialProjectionSnapshotService,
    AcademicFinancialProjectionReconciliationService,
    AcademicFinancialProjectionWriterService,
    AcademicFinancialProjectionIntakeService,
  ],
})
export class AcademicFinancialProjectionModule {}
