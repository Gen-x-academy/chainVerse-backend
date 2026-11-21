import { Module } from '@nestjs/common';
import { WorkBreakdownAuditService } from './work-breakdown-audit.service';
import { WorkBreakdownController } from './work-breakdown.controller';
import { WorkBreakdownRepository } from './work-breakdown.repository';
import { WorkBreakdownService } from './work-breakdown.service';

/**
 * CAPSTONE-058 — Work Breakdown Structures module.
 *
 * Provides WBS creation, ordered work packages, tasks, dependencies,
 * estimates, assignees, acceptance conditions, and progress weights.
 * All data is tenant-isolated. No external DB dependency; the in-memory
 * repository pattern matches ProjectPlanningModule for consistency.
 */
@Module({
  controllers: [WorkBreakdownController],
  providers: [
    WorkBreakdownService,
    WorkBreakdownRepository,
    WorkBreakdownAuditService,
  ],
  exports: [WorkBreakdownService, WorkBreakdownAuditService],
})
export class WorkBreakdownModule {}
