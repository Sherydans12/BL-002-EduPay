import { Module } from '@nestjs/common';

import { AcademicFinancialProjectionAuthGuard } from './academic-financial-projection-auth.guard';
import { AcademicFinancialProjectionConfigService } from './academic-financial-projection-config.service';
import {
  AcademicFinancialProjectionConsumerController,
  AcademicFinancialProjectionShadowAdminController,
} from './academic-financial-projection.controller';
import { AcademicFinancialProjectionSnapshotService } from './academic-financial-projection-snapshot.service';
import { AcademicFinancialProjectionService } from './academic-financial-projection.service';

@Module({
  controllers: [
    AcademicFinancialProjectionConsumerController,
    AcademicFinancialProjectionShadowAdminController,
  ],
  providers: [
    AcademicFinancialProjectionConfigService,
    AcademicFinancialProjectionAuthGuard,
    AcademicFinancialProjectionService,
    AcademicFinancialProjectionSnapshotService,
  ],
})
export class AcademicFinancialProjectionModule {}
