import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { SkipTransform } from '../common/decorators/skip-transform.decorator';
import { renderEmailTemplatePreview } from '../mail/templates/email-templates';
import { CommunicationsService } from './communications.service';
import { FindSentCommunicationsQueryDto } from './dto/find-sent-communications-query.dto';
import { PreviewEmailTemplateQueryDto } from './dto/preview-email-template-query.dto';
import { RetryCommunicationParamsDto } from './dto/retry-communication-params.dto';
import { UpdateTenantEmailConfigDto } from './dto/update-tenant-email-config.dto';

@ApiTags('communications')
@Controller('v1/communications')
@UseGuards(JwtAuthGuard)
export class CommunicationsController {
  constructor(
    private readonly communicationsService: CommunicationsService,
    private readonly config: ConfigService,
  ) {}

  @Get('templates/preview')
  @Public()
  @SkipTransform()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Vista previa local de plantillas de correo' })
  getTemplatePreview(@Query() query: PreviewEmailTemplateQueryDto): string {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new NotFoundException();
    }

    return renderEmailTemplatePreview(query.type);
  }

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
