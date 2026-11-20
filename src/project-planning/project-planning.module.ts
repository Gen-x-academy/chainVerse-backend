import { Module } from '@nestjs/common';
import { PlanningAuditService } from './project-planning-audit.service';
import { ProjectPlanningController } from './project-planning.controller';
import { ProjectPlanningRepository } from './project-planning.repository';
import { ProjectPlanningService } from './project-planning.service';

@Module({
  controllers: [ProjectPlanningController],
  providers: [
    ProjectPlanningService,
    ProjectPlanningRepository,
    PlanningAuditService,
  ],
  exports: [ProjectPlanningService, PlanningAuditService],
})
export class ProjectPlanningModule {}
