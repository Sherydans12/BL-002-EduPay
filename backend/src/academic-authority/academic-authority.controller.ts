import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AcademicAuthorityService } from './academic-authority.service';

@ApiTags('academic-authority')
@Controller('academic-authority')
@UseGuards(JwtAuthGuard)
export class AcademicAuthorityController {
  constructor(private readonly authority: AcademicAuthorityService) {}

  @Get()
  @ApiOperation({
    summary:
      'Indica si alumnos, cursos y años del tenant se gestionan en EduPay Académico (ADR-0028)',
  })
  async status(): Promise<{ managedByAcademico: boolean }> {
    return { managedByAcademico: await this.authority.managedByAcademico() };
  }
}
