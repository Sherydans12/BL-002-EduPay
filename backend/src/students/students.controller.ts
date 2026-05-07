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
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@ApiTags('students')
@Controller('students')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @RequirePermissions('manage:students')
  @ApiOperation({ summary: 'Registrar un nuevo alumno' })
  @ApiResponse({ status: 201, description: 'Alumno creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 409, description: 'RUT duplicado' })
  create(@Body() dto: CreateStudentDto) {
    return this.studentsService.create(dto);
  }

  @Get('export')
  @RequirePermissions('view:students')
  @ApiOperation({ summary: 'Exportar alumnos a XLSX' })
  @ApiQuery({ name: 'courseId', required: false, type: Number, description: 'Filtrar por ID de curso' })
  @ApiResponse({ status: 200, description: 'Archivo XLSX descargado' })
  async exportXlsx(
    @Query('courseId') courseId: string | undefined,
    @Res() res: Response,
  ) {
    const parsedCourseId = courseId ? Number(courseId) : undefined;
    const buffer = await this.studentsService.exportToXlsx(parsedCourseId);
    const date = new Date().toISOString().split('T')[0];
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=alumnos_${date}.xlsx`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  @Get()
  @RequirePermissions('view:students')
  @ApiOperation({ summary: 'Listar alumnos paginados (filtro opcional por curso)' })
  @ApiQuery({ name: 'courseId', required: false, type: Number, description: 'Filtrar por ID de curso' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({ status: 200, description: 'Lista paginada de alumnos con curso y apoderado' })
  findAll(
    @Query('courseId') courseId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    const parsedCourseId = courseId ? Number(courseId) : undefined;
    return this.studentsService.findAll(parsedCourseId, page, limit);
  }

  @Get(':id')
  @RequirePermissions('view:students')
  @ApiOperation({ summary: 'Obtener un alumno por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del alumno' })
  @ApiResponse({ status: 200, description: 'Alumno con curso, apoderado y pagos' })
  @ApiResponse({ status: 404, description: 'Alumno no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.studentsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('manage:students')
  @ApiOperation({ summary: 'Actualizar un alumno' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del alumno' })
  @ApiResponse({ status: 200, description: 'Alumno actualizado' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 404, description: 'Alumno no encontrado' })
  @ApiResponse({ status: 409, description: 'RUT duplicado' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.studentsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('manage:students')
  @ApiOperation({ summary: 'Eliminar (soft delete) un alumno' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del alumno' })
  @ApiResponse({ status: 200, description: 'Alumno eliminado lógicamente' })
  @ApiResponse({ status: 404, description: 'Alumno no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.studentsService.remove(id);
  }
}
