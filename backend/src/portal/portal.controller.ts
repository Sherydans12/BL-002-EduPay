import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { GuardianRutPipe } from '../common/rut/guardian-rut.pipe';
import { SyncPortalPaymentDto } from './dto/sync-portal-payment.dto';
import { UpdatePortalGuardianEmailDto } from './dto/update-guardian-email.dto';
import {
  PortalApiErrorResponseDto,
  PortalGuardianEmailUpdatedResponseDto,
  PortalGuardianLookupResponseDto,
} from './dto/portal-guardian-response.dto';
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
  @ApiResponse({
    status: 200,
    description: 'Resultado de existencia y versión vigente del apoderado',
    type: PortalGuardianLookupResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'RUT inválido',
    type: PortalApiErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'API key ausente, inválida o de otro tenant',
    type: PortalApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Tenant inexistente',
    type: PortalApiErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno o configuración S2S inválida',
    type: PortalApiErrorResponseDto,
  })
  getGuardian(@Param('rut', GuardianRutPipe) rut: string) {
    return this.portalService.findGuardian(rut);
  }

  @Patch('guardian/:rut/email')
  @ApiOperation({
    summary: 'Actualizar exclusivamente el correo de un apoderado',
    description:
      'Usa concurrencia optimista mediante expectedUpdatedAt. El Portal debe haber verificado previamente la propiedad del correo.',
  })
  @ApiParam({ name: 'rut', example: '12.345.678-5' })
  @ApiBody({ type: UpdatePortalGuardianEmailDto })
  @ApiResponse({
    status: 200,
    description: 'Correo actualizado o ya vigente',
    type: PortalGuardianEmailUpdatedResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'RUT o payload inválido',
    type: PortalApiErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'API key ausente, inválida o de otro tenant',
    type: PortalApiErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Tenant o apoderado inexistente',
    type: PortalApiErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'El apoderado cambió desde la última lectura del Portal',
    type: PortalApiErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno o configuración S2S inválida',
    type: PortalApiErrorResponseDto,
  })
  updateGuardianEmail(
    @Param('rut', GuardianRutPipe) rut: string,
    @Body() dto: UpdatePortalGuardianEmailDto,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.portalService.updateGuardianEmail(rut, dto, tenantId);
  }

  @Get('guardian/:rut/statement')
  @ApiOperation({ summary: 'Obtener el estado de cuenta del apoderado' })
  @ApiParam({ name: 'rut', example: '12.345.678-5' })
  @ApiResponse({ status: 200, description: 'Estado de cuenta completo' })
  @ApiResponse({ status: 404, description: 'Apoderado no encontrado' })
  getStatement(@Param('rut', GuardianRutPipe) rut: string) {
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
