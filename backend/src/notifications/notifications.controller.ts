import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { FindNotificationsQueryDto } from './dto/find-notifications-query.dto';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar un log de notificación' })
  @ApiResponse({ status: 201, description: 'Log registrado exitosamente' })
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.logNotification(createNotificationDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar historial de notificaciones' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'SENT', 'FAILED'],
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: [
      'BOLETA_DELIVERY',
      'PAYMENT_RECEIPT',
      'COBRANZA_PREVENTIVA',
      'COBRANZA_MORA',
    ],
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de logs con alumno y grupo de pago',
  })
  findAll(@Query() query: FindNotificationsQueryDto) {
    return this.notificationsService.findAll(query);
  }
}
