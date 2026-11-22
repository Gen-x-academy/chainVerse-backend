import { Module } from '@nestjs/common';
import { ScheduleAuditService } from './project-schedule-risk-audit.service';
import { ProjectScheduleRiskController } from './project-schedule-risk.controller';
import { ProjectScheduleRiskRepository } from './project-schedule-risk.repository';
import { ProjectScheduleRiskService } from './project-schedule-risk.service';

/**
 * CAPSTONE-059 — Dependency cycle detection and schedule risk analysis.
 *
 * Additive, in-memory, tenant-keyed; no migration. Provide
 * `SCHEDULE_RISK_NOTIFIER` to deliver high/critical findings; without it
 * snapshots are still recorded and nothing is notified.
 */
@Module({
  controllers: [ProjectScheduleRiskController],
  providers: [
    ProjectScheduleRiskService,
    ProjectScheduleRiskRepository,
    ScheduleAuditService,
  ],
  exports: [ProjectScheduleRiskService],
})
export class ProjectScheduleRiskModule {}
