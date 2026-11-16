import { Module } from '@nestjs/common';
import { ChargesService } from './charges.service';
import { ChargesController } from './charges.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AcademicYearsModule } from '../academic-years/academic-years.module';

@Module({
  imports: [PrismaModule, AcademicYearsModule],
  controllers: [ChargesController],
  providers: [ChargesService],
})
export class ChargesModule {}
