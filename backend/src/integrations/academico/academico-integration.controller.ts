import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { AcademicoAuthGuard } from './academico-auth.guard';
import { AcademicoIntegrationService } from './academico-integration.service';
import { AcademicoObservabilityInterceptor } from './academico-observability.interceptor';
import { AcademicoRateLimitGuard } from './academico-rate-limit.guard';
import type { AcademicoRequest } from './academico-integration.types';
import { AcademicoFeedQueryDto } from './dto/academico-feed-query.dto';
import { AcademicoSnapshotCompletionQueryDto } from './dto/academico-snapshot-completion-query.dto';

@Public()
@SkipTransform()
@ApiTags('academico-integration')
@ApiBearerAuth('academico-integration-token')
@ApiHeader({
  name: 'x-source-tenant-id',
  required: true,
  description: 'Allowed EduPay source tenant configured on the server',
})
@ApiHeader({
  name: 'x-correlation-id',
  required: false,
  description: 'Safe caller correlation identifier; generated when omitted',
})
@UseGuards(AcademicoAuthGuard, AcademicoRateLimitGuard)
@UseInterceptors(AcademicoObservabilityInterceptor)
@Controller('v1/integrations/academico')
export class AcademicoIntegrationController {
  constructor(private readonly service: AcademicoIntegrationService) {}

  @Get('snapshot')
  @ApiOperation({
    summary: 'Start a tenant-wide full reconciliation boundary',
  })
  createSnapshot(@Req() request: AcademicoRequest) {
    return this.service.createSnapshot(
      request.academicoIntegration!.sourceTenantId,
    );
  }

  @Get('snapshot/complete')
  @ApiOperation({
    summary: 'Verify both entity feeds completed the same full snapshot',
  })
  completeSnapshot(
    @Req() request: AcademicoRequest,
    @Query() query: AcademicoSnapshotCompletionQueryDto,
  ) {
    return this.service.completeSnapshot(
      request.academicoIntegration!.sourceTenantId,
      query,
    );
  }

  @Get('courses')
  @ApiOperation({ summary: 'Read the sparse Course synchronization feed' })
  courses(
    @Req() request: AcademicoRequest,
    @Query() query: AcademicoFeedQueryDto,
  ) {
    return this.service.courses(
      request.academicoIntegration!.sourceTenantId,
      query,
    );
  }

  @Get('students')
  @ApiOperation({ summary: 'Read the sparse Student synchronization feed' })
  students(
    @Req() request: AcademicoRequest,
    @Query() query: AcademicoFeedQueryDto,
  ) {
    return this.service.students(
      request.academicoIntegration!.sourceTenantId,
      query,
    );
  }
}
