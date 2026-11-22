import { Module } from '@nestjs/common';
import { ObjectivesAuditService } from './project-objectives-audit.service';
import { ProjectObjectivesController } from './project-objectives.controller';
import { ProjectObjectivesRepository } from './project-objectives.repository';
import { ProjectObjectivesService } from './project-objectives.service';

/**
 * CAPSTONE-057 — Project objectives and success criteria.
 *
 * Additive, in-memory, tenant-keyed; no migration. Distinct from the minimal
 * check-in objectives in `project-planning`: it adds priorities, owners,
 * baselines/targets, dates, visibility, charter linkage and success criteria.
 */
@Module({
  controllers: [ProjectObjectivesController],
  providers: [
    ProjectObjectivesService,
    ProjectObjectivesRepository,
    ObjectivesAuditService,
  ],
  exports: [ProjectObjectivesService],
})
export class ProjectObjectivesModule {}
