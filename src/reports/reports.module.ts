import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportController } from './reports.controller';
import { ReportService } from './reports.service';
import { Tutor } from '../entities/tutor.entity';
import { Course } from '../entities/course.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Tutor, Course])],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportsModule {}