import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunicationsService } from './communications.service';
import { FindSentCommunicationsQueryDto } from './dto/find-sent-communications-query.dto';
import { RetryCommunicationParamsDto } from './dto/retry-communication-params.dto';
import { UpdateTenantEmailConfigDto } from './dto/update-tenant-email-config.dto';

@ApiTags('communications')
@Controller('v1/communications')
@UseGuards(JwtAuthGuard)
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Obtener la configuración de correo del tenant' })
  getEmailSettings() {
    return this.communicationsService.getEmailSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Actualizar la configuración de correo del tenant' })
  updateEmailSettings(@Body() dto: UpdateTenantEmailConfigDto) {
    return this.communicationsService.updateEmailSettings(dto);
  }

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

  @Post(':id/retry')
  @ApiOperation({ summary: 'Reintentar una comunicación fallida o rebotada' })
  @ApiResponse({
    status: 201,
    description: 'La comunicación fue reenviada y su trazabilidad actualizada',
  })
  retryCommunication(@Param() params: RetryCommunicationParamsDto) {
    return this.communicationsService.retryCommunication(params.id);
  }
}
