import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PaymentConceptsService } from './payment-concepts.service';
import { CreatePaymentConceptDto } from './dto/create-payment-concept.dto';
import { UpdatePaymentConceptDto } from './dto/update-payment-concept.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@ApiTags('payment-concepts')
@Controller('payment-concepts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentConceptsController {
  constructor(private readonly service: PaymentConceptsService) {}

  @Post()
  @RequirePermissions('manage:payment-concepts')
  @ApiOperation({ summary: 'Crear un nuevo concepto de pago' })
  @ApiResponse({ status: 201, description: 'Concepto creado' })
  @ApiResponse({ status: 409, description: 'Nombre duplicado' })
  create(@Body() dto: CreatePaymentConceptDto) {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermissions('view:payment-concepts')
  @ApiOperation({ summary: 'Listar todos los conceptos activos' })
  @ApiResponse({ status: 200, description: 'Lista de conceptos' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('view:payment-concepts')
  @ApiOperation({ summary: 'Obtener un concepto por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Concepto encontrado' })
  @ApiResponse({ status: 404, description: 'Concepto no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('manage:payment-concepts')
  @ApiOperation({ summary: 'Actualizar un concepto de pago' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Concepto actualizado' })
  @ApiResponse({ status: 404, description: 'Concepto no encontrado' })
  @ApiResponse({ status: 409, description: 'Nombre duplicado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentConceptDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('manage:payment-concepts')
  @ApiOperation({ summary: 'Eliminar (soft-delete) un concepto de pago' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Concepto desactivado' })
  @ApiResponse({ status: 404, description: 'Concepto no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
