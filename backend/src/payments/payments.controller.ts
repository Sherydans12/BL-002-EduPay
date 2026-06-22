import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreatePaymentBatchDto } from './dto/create-payment-batch.dto';
import { FilterPaymentsDto } from './dto/filter-payments.dto';
import { multerConfig } from './multer.config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @RequirePermissions('create:payment')
  @ApiOperation({
    summary: 'Registrar un nuevo pago',
    description:
      'Registra un pago asociado a un alumno. Acepta multipart/form-data ' +
      'para enviar simultáneamente los datos del pago y el archivo PDF de la boleta.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Payload del pago con archivo PDF opcional',
    schema: {
      type: 'object',
      required: ['amount', 'method', 'paymentDate', 'studentId'],
      properties: {
        amount: {
          type: 'integer',
          minimum: 1,
          example: 75000,
          description: 'Monto en pesos chilenos',
        },
        method: {
          type: 'string',
          enum: ['CASH', 'DEBIT', 'CREDIT', 'CHECK', 'TRANSFER'],
          example: 'CASH',
          description: 'Método de pago',
        },
        paymentDate: {
          type: 'string',
          format: 'date',
          example: '2026-04-30',
          description: 'Fecha del pago (YYYY-MM-DD)',
        },
        studentId: {
          type: 'integer',
          example: 1,
          description: 'ID del alumno',
        },
        payerName: {
          type: 'string',
          nullable: true,
          example: 'Pedro Soto',
          description: 'Nombre del pagador alternativo (null = apoderado)',
        },
        payerRut: {
          type: 'string',
          nullable: true,
          example: '11.222.333-4',
          description: 'RUT del pagador alternativo',
        },
        referenceCode: {
          type: 'string',
          nullable: true,
          example: 'TRX-2026-00142',
          description: 'Código de referencia de la transacción',
        },
        notes: {
          type: 'string',
          nullable: true,
          description: 'Notas u observaciones',
        },
        boletaNumber: {
          type: 'string',
          nullable: true,
          example: 'BOL-00587',
          description: 'Número de boleta SII',
        },
        conceptId: {
          type: 'integer',
          nullable: true,
          example: 1,
          description: 'ID del concepto de pago (Mensualidad, Matrícula, etc.)',
        },
        boleta: {
          type: 'string',
          format: 'binary',
          description: 'Archivo PDF de la boleta (máximo 10 MB)',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Pago registrado exitosamente' })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o archivo no es PDF',
  })
  @ApiResponse({ status: 404, description: 'Alumno no encontrado' })
  @UseInterceptors(FileInterceptor('boleta', multerConfig))
  create(
    @Body() dto: CreatePaymentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const fileUrl = file ? `/uploads/${file.filename}` : undefined;
    return this.paymentsService.create(dto, fileUrl);
  }

  @Post('batch')
  @RequirePermissions('create:payment')
  @ApiOperation({
    summary: 'Registrar pago agrupado (varios alumnos, una boleta)',
    description:
      'Crea un PaymentGroup y un Payment por cada allocation. ' +
      'Acepta multipart/form-data; el campo allocations debe ser un JSON array.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    description: 'Cobro agrupado con allocations y PDF opcional',
    schema: {
      type: 'object',
      required: ['totalAmount', 'method', 'paymentDate', 'allocations'],
      properties: {
        totalAmount: { type: 'integer', minimum: 1, example: 150000 },
        method: {
          type: 'string',
          enum: ['CASH', 'DEBIT', 'CREDIT', 'CHECK', 'TRANSFER'],
        },
        paymentDate: { type: 'string', format: 'date', example: '2026-05-25' },
        boletaNumber: { type: 'string', nullable: true },
        notes: { type: 'string', nullable: true },
        allocations: {
          type: 'string',
          description:
            'JSON array: [{ studentId, conceptId, amount }]. Suma de amount = totalAmount.',
          example:
            '[{"studentId":1,"conceptId":1,"amount":75000},{"studentId":2,"conceptId":1,"amount":75000}]',
        },
        boleta: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'PaymentGroup creado con sus payments',
  })
  @ApiResponse({
    status: 400,
    description: 'Validación fallida (suma de montos, allocations vacío)',
  })
  @UseInterceptors(FileInterceptor('boleta', multerConfig))
  createBatch(
    @Body() dto: CreatePaymentBatchDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const fileUrl = file ? `/uploads/${file.filename}` : undefined;
    return this.paymentsService.createBatch(dto, fileUrl);
  }

  @Get('export')
  @RequirePermissions('view:payments')
  @ApiOperation({
    summary: 'Exportar pagos a XLSX',
    description:
      'Genera y descarga un archivo Excel con todos los pagos que cumplan los filtros. ' +
      'Los parámetros page y limit son ignorados.',
  })
  @ApiResponse({ status: 200, description: 'Archivo XLSX descargado' })
  async exportXlsx(@Query() filters: FilterPaymentsDto, @Res() res: Response) {
    const buffer = await this.paymentsService.exportToXlsx(filters);
    const date = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=pagos_${date}.xlsx`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  @Get('groups')
  @RequirePermissions('view:payments')
  @ApiOperation({
    summary: 'Listar transacciones (PaymentGroup) paginadas',
    description:
      'Historial agrupado por cobro. Incluye líneas de pago por alumno. ' +
      'Soporta filtros por fecha, curso y alumno.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de grupos con payments',
  })
  findGroups(@Query() filters: FilterPaymentsDto) {
    return this.paymentsService.findGroups(filters);
  }

  @Delete('groups/:id')
  @RequirePermissions('manage:payments')
  @ApiOperation({ summary: 'Anular una transacción de pago completa' })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID del grupo/transacción de pago',
  })
  @ApiResponse({ status: 200, description: 'Transacción anulada' })
  @ApiResponse({ status: 404, description: 'Transacción no encontrada' })
  removeGroup(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.removeGroup(id);
  }

  @Get()
  @RequirePermissions('view:payments')
  @ApiOperation({
    summary: 'Listar pagos con filtros avanzados',
    description:
      'Retorna pagos paginados. Permite filtrar por rango de fechas, ' +
      'ID de curso (a través del alumno) e ID de alumno.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista paginada de pagos con meta de paginación',
  })
  findAll(@Query() filters: FilterPaymentsDto) {
    return this.paymentsService.findAll(filters);
  }

  @Get('summary/by-course')
  @RequirePermissions('view:payments')
  @ApiOperation({
    summary: 'Resumen de pagos agrupados por curso',
    description: 'Devuelve total recaudado y cantidad de pagos por cada curso.',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'Fecha inicio (ISO 8601)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'Fecha fin (ISO 8601)',
  })
  @ApiResponse({ status: 200, description: 'Resumen por curso' })
  summaryByCourse(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.paymentsService.summaryByCourse(dateFrom, dateTo);
  }

  @Get(':id')
  @RequirePermissions('view:payments')
  @ApiOperation({ summary: 'Obtener un pago por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del pago' })
  @ApiResponse({
    status: 200,
    description: 'Pago encontrado con detalle de alumno, curso y apoderado',
  })
  @ApiResponse({ status: 404, description: 'Pago no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.findOne(id);
  }

}
