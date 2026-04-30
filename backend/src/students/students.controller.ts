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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar un nuevo alumno' })
  @ApiResponse({ status: 201, description: 'Alumno creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos' })
  @ApiResponse({ status: 409, description: 'RUT duplicado' })
  create(@Body() dto: CreateStudentDto) {
    return this.studentsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar alumnos (filtro opcional por curso)' })
  @ApiQuery({ name: 'courseId', required: false, type: Number, description: 'Filtrar por ID de curso' })
  @ApiResponse({ status: 200, description: 'Lista de alumnos con curso y apoderado' })
  findAll(@Query('courseId') courseId?: number) {
    return this.studentsService.findAll(courseId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un alumno por ID' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del alumno' })
  @ApiResponse({ status: 200, description: 'Alumno con curso, apoderado y pagos' })
  @ApiResponse({ status: 404, description: 'Alumno no encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.studentsService.findOne(id);
  }

  @Put(':id')
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
  @ApiOperation({ summary: 'Eliminar un alumno' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del alumno' })
  @ApiResponse({ status: 200, description: 'Alumno eliminado' })
  @ApiResponse({ status: 404, description: 'Alumno no encontrado' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.studentsService.remove(id);
  }
}
