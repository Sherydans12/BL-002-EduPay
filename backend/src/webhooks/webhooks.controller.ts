import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { TransbankWebhookDto } from './dto/transbank-webhook.dto';
import { WebhooksService } from './webhooks.service';

@Public()
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('transbank')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recibir confirmacion asincrona de Webpay' })
  @ApiResponse({ status: 200, description: 'Webhook recibido' })
  receiveTransbankWebhook(@Body() dto: TransbankWebhookDto) {
    return this.webhooksService.processTransbankNotification(dto);
  }
}
