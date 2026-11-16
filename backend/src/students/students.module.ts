import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years.module';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';

@Module({
  imports: [AcademicYearsModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
