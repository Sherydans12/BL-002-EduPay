import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { SkipTransform } from '../common/decorators/skip-transform.decorator';
import { HealthService } from './health.service';

@Controller('v1/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @SkipTransform()
  @Get()
  getHealth() {
    return this.healthService.getHealth();
  }
}
