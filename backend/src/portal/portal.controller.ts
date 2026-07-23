import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SyncPortalPaymentDto } from './dto/sync-portal-payment.dto';
import { PortalService } from './portal.service';

@Public()
@ApiTags('portal')
@ApiBearerAuth('portal-api-key')
@ApiHeader({
  name: 'x-tenant-id',
  required: true,
  example: 'colegio-pruebas',
  description: 'Identificador del tenant que origina la llamada S2S',
})
@Controller('v1/portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('guardian/:rut')
  @ApiOperation({ summary: 'Validar un apoderado por RUT para el portal' })
  @ApiParam({ name: 'rut', example: '12.345.678-5' })
  @ApiResponse({ status: 200, description: 'Resultado de existencia' })
  getGuardian(@Param('rut') rut: string) {
    return this.portalService.findGuardian(rut);
  }

  @Get('guardian/:rut/statement')
  @ApiOperation({ summary: 'Obtener el estado de cuenta del apoderado' })
  @ApiParam({ name: 'rut', example: '12.345.678-5' })
  @ApiResponse({ status: 200, description: 'Estado de cuenta completo' })
  @ApiResponse({ status: 404, description: 'Apoderado no encontrado' })
  getStatement(@Param('rut') rut: string) {
    return this.portalService.getGuardianStatement(rut);
  }

  @Post('payments/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sincronizar un pago Webpay exitoso' })
  @ApiResponse({ status: 200, description: 'Pago sincronizado o ya procesado' })
  @ApiResponse({ status: 400, description: 'Monto o payload inválido' })
  @ApiResponse({ status: 404, description: 'Alguna cuota no existe' })
  @ApiResponse({ status: 409, description: 'Orden o cuota en conflicto' })
  syncPayment(
    @Body() dto: SyncPortalPaymentDto,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.portalService.syncPayment(dto, tenantId);
  }
}
