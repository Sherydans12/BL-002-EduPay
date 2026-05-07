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
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo curso' })
  @ApiResponse({ status: 201, description: 'Curso creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  create(@Body() dto: CreateCourseDto) {
    return this.coursesService.create(dto);
  }

  @Get('export')
  @ApiOperation({ summary: 'Exportar cursos a XLSX' })
  @ApiResponse({ status: 200, description: 'Archivo XLSX descargado' })
  async exportXlsx(@Res() res: Response) {
    const buffer = await this.coursesService.exportToXlsx();
    const date = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=cursos_${date}.xlsx`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los cursos (paginado)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({ status: 200, description: 'Lista paginada de cursos con conteo de alumnos' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.coursesService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un curso por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del curso' })
  @ApiResponse({ status: 200, description: 'Curso encontrado con detalle de alumnos' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.coursesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar un curso' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del curso' })
  @ApiResponse({ status: 200, description: 'Curso actualizado' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.coursesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar (soft delete) un curso' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del curso' })
  @ApiResponse({ status: 200, description: 'Curso eliminado lógicamente' })
  @ApiResponse({ status: 404, description: 'Curso no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.coursesService.remove(id);
  }
}
