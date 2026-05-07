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
  @ApiResponse({ status: 400, description: 'Datos inválidos o archivo no es PDF' })
  @ApiResponse({ status: 404, description: 'Alumno no encontrado' })
  @UseInterceptors(FileInterceptor('boleta', multerConfig))
  create(
    @Body() dto: CreatePaymentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const fileUrl = file ? `/uploads/${file.filename}` : undefined;
    return this.paymentsService.create(dto, fileUrl);
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
  async exportXlsx(
    @Query() filters: FilterPaymentsDto,
    @Res() res: Response,
  ) {
    const buffer = await this.paymentsService.exportToXlsx(filters);
    const date = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=pagos_${date}.xlsx`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  @Get()
  @RequirePermissions('view:payments')
  @ApiOperation({
    summary: 'Listar pagos con filtros avanzados',
    description:
      'Retorna pagos paginados. Permite filtrar por rango de fechas, ' +
      'ID de curso (a través del alumno) e ID de alumno.',
  })
  @ApiResponse({ status: 200, description: 'Lista paginada de pagos con meta de paginación' })
  findAll(@Query() filters: FilterPaymentsDto) {
    return this.paymentsService.findAll(filters);
  }

  @Get('summary/by-course')
  @RequirePermissions('view:payments')
  @ApiOperation({
    summary: 'Resumen de pagos agrupados por curso',
    description: 'Devuelve total recaudado y cantidad de pagos por cada curso.',
  })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Fecha inicio (ISO 8601)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'Fecha fin (ISO 8601)' })
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
  @ApiResponse({ status: 200, description: 'Pago encontrado con detalle de alumno, curso y apoderado' })
  @ApiResponse({ status: 404, description: 'Pago no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.findOne(id);
  }

  @Delete(':id')
  @RequirePermissions('manage:payments')
  @ApiOperation({ summary: 'Eliminar un pago' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del pago' })
  @ApiResponse({ status: 200, description: 'Pago eliminado' })
  @ApiResponse({ status: 404, description: 'Pago no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.remove(id);
  }
}
