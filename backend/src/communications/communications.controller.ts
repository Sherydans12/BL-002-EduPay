import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunicationsService } from './communications.service';
import { FindSentCommunicationsQueryDto } from './dto/find-sent-communications-query.dto';

@ApiTags('communications')
@Controller('v1/communications')
@UseGuards(JwtAuthGuard)
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar correos enviados del colegio actual' })
  @ApiResponse({
    status: 200,
    description: 'Bandeja paginada de comunicaciones enviadas',
  })
  getSentCommunications(@Query() query: FindSentCommunicationsQueryDto) {
    const { page = 1, limit = 20, ...filters } = query;
    return this.communicationsService.getSentCommunications(
      page,
      limit,
      filters,
    );
  }
}
