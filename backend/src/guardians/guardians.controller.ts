import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { GuardiansService } from './guardians.service';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';

@ApiTags('guardians')
@Controller('guardians')
export class GuardiansController {
  constructor(private readonly guardiansService: GuardiansService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar un nuevo apoderado' })
  @ApiResponse({ status: 201, description: 'Apoderado creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 409, description: 'RUT duplicado' })
  create(@Body() dto: CreateGuardianDto) {
    return this.guardiansService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los apoderados' })
  @ApiResponse({ status: 200, description: 'Lista de apoderados con conteo de alumnos' })
  findAll() {
    return this.guardiansService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un apoderado por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del apoderado' })
  @ApiResponse({ status: 200, description: 'Apoderado encontrado con detalle de alumnos' })
  @ApiResponse({ status: 404, description: 'Apoderado no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.guardiansService.findOne(id);
  }

  @Put(':id')
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
  @ApiOperation({ summary: 'Eliminar un apoderado' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del apoderado' })
  @ApiResponse({ status: 200, description: 'Apoderado eliminado' })
  @ApiResponse({ status: 404, description: 'Apoderado no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.guardiansService.remove(id);
  }
}
