import { Global, Module } from '@nestjs/common';

import { AcademicAuthorityController } from './academic-authority.controller';
import { AcademicAuthorityService } from './academic-authority.service';

@Global()
@Module({
  controllers: [AcademicAuthorityController],
  providers: [AcademicAuthorityService],
  exports: [AcademicAuthorityService],
})
export class AcademicAuthorityModule {}
