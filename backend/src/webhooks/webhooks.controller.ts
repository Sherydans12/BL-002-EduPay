import { Headers, HttpCode, Post, RawBody, Controller } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('resend')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Recibir eventos de entrega de Resend' })
  @ApiResponse({ status: 200, description: 'Evento recibido' })
  receiveResendWebhook(
    @RawBody() rawBody: Buffer | undefined,
    @Headers('svix-id') id: string | undefined,
    @Headers('svix-timestamp') timestamp: string | undefined,
    @Headers('svix-signature') signature: string | undefined,
  ) {
    return this.webhooksService.processResendWebhook(
      rawBody?.toString('utf8') ?? '',
      {
        id: id ?? '',
        timestamp: timestamp ?? '',
        signature: signature ?? '',
      },
    );
  }
}
