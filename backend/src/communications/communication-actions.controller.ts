import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CommunicationActionsService } from './communication-actions.service';
import { SendPaymentRemindersDto } from './dto/send-payment-reminders.dto';

@ApiTags('communications')
@Controller('v1/communications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommunicationActionsController {
  constructor(
    private readonly communicationActionsService: CommunicationActionsService,
  ) {}

  @Get('reminders/preview')
  @RequirePermissions('manage:payments')
  @ApiOperation({
    summary: 'Previsualizar lista de apoderados y cuotas vencidas a notificar',
  })
  @ApiResponse({
    status: 200,
    description: 'Resumen y lista de apoderados con deuda vencida',
  })
  getRemindersPreview(@Query() query: SendPaymentRemindersDto) {
    return this.communicationActionsService.getRemindersPreview(
      query.courseId,
      query.studentId,
    );
  }

  @Post('reminders')
  @RequirePermissions('manage:payments')
  @ApiOperation({
    summary: 'Enviar recordatorios a apoderados con cuotas vencidas',
  })
  @ApiResponse({
    status: 201,
    description: 'Resultado del envío masivo o filtrado de recordatorios',
  })
  sendPaymentReminders(@Body() dto: SendPaymentRemindersDto) {
    return this.communicationActionsService.sendPaymentReminders(dto);
  }
}
