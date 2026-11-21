import { Module } from '@nestjs/common';
import { MilestonesAuditService } from './project-milestones-audit.service';
import { ProjectMilestonesController } from './project-milestones.controller';
import { ProjectMilestonesRepository } from './project-milestones.repository';
import { ProjectMilestonesService } from './project-milestones.service';

/**
 * CAPSTONE-060 — Project Milestones
 *
 * In-memory, tenant-keyed module.  No external persistence dependency; additive
 * and requires no migration.  Registered in AppModule imports list.
 */
@Module({
  controllers: [ProjectMilestonesController],
  providers: [
    ProjectMilestonesService,
    ProjectMilestonesRepository,
    MilestonesAuditService,
  ],
  exports: [ProjectMilestonesService, MilestonesAuditService],
})
export class ProjectMilestonesModule {}
