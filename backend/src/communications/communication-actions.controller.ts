import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CommunicationActionsService } from './communication-actions.service';

@ApiTags('communications')
@Controller('v1/communications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommunicationActionsController {
  constructor(
    private readonly communicationActionsService: CommunicationActionsService,
  ) {}

  @Post('reminders')
  @RequirePermissions('manage:payments')
  @ApiOperation({
    summary: 'Enviar recordatorios a apoderados con cuotas vencidas',
  })
  @ApiResponse({
    status: 201,
    description: 'Resultado del envío masivo de recordatorios',
  })
  sendPaymentReminders() {
    return this.communicationActionsService.sendPaymentReminders();
  }
}
