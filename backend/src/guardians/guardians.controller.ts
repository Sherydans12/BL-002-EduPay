import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { GuardiansService } from './guardians.service';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@ApiTags('guardians')
@Controller('guardians')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GuardiansController {
  constructor(private readonly guardiansService: GuardiansService) {}

  @Post()
  @RequirePermissions('manage:guardians')
  @ApiOperation({ summary: 'Registrar un nuevo apoderado' })
  @ApiResponse({ status: 201, description: 'Apoderado creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 409, description: 'RUT duplicado' })
  create(@Body() dto: CreateGuardianDto) {
    return this.guardiansService.create(dto);
  }

  @Get('export')
  @RequirePermissions('view:guardians')
  @ApiOperation({ summary: 'Exportar apoderados a XLSX' })
  @ApiResponse({ status: 200, description: 'Archivo XLSX descargado' })
  async exportXlsx(@Res() res: Response) {
    const buffer = await this.guardiansService.exportToXlsx();
    const date = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=apoderados_${date}.xlsx`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  @Get()
  @RequirePermissions('view:guardians')
  @ApiOperation({ summary: 'Listar todos los apoderados (paginado)' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Buscar por nombre o RUT (orden de palabras flexible)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({ status: 200, description: 'Lista paginada de apoderados con conteo de alumnos' })
  findAll(
    @Query('search') search: string | undefined,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    const trimmed = search?.trim();
    return this.guardiansService.findAll(page, limit, trimmed || undefined);
  }

  @Get(':id')
  @RequirePermissions('view:guardians')
  @ApiOperation({ summary: 'Obtener un apoderado por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del apoderado' })
  @ApiResponse({ status: 200, description: 'Apoderado encontrado con detalle de alumnos' })
  @ApiResponse({ status: 404, description: 'Apoderado no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.guardiansService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('manage:guardians')
  @ApiOperation({ summary: 'Actualizar un apoderado' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del apoderado' })
  @ApiResponse({ status: 200, description: 'Apoderado actualizado' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'Apoderado no encontrado' })
  @ApiResponse({ status: 409, description: 'RUT duplicado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGuardianDto,
  ) {
    return this.guardiansService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('manage:guardians')
  @ApiOperation({ summary: 'Eliminar (soft delete) un apoderado' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del apoderado' })
  @ApiResponse({ status: 200, description: 'Apoderado eliminado lógicamente' })
  @ApiResponse({ status: 404, description: 'Apoderado no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.guardiansService.remove(id);
  }
}
