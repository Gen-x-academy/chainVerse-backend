import { Module } from '@nestjs/common';
import { ProjectMilestonesModule } from '../project-milestones/project-milestones.module';
import { GovernanceAuditService } from './project-governance-export-audit.service';
import { ProjectGovernanceExportController } from './project-governance-export.controller';
import { ProjectGovernanceExportRepository } from './project-governance-export.repository';
import { ProjectGovernanceExportService } from './project-governance-export.service';
import { GOVERNANCE_MILESTONE_SOURCE } from './project-governance-export.types';
import { MilestoneSummarySource } from './milestone-summary.source';

/**
 * CAPSTONE-056 — Export project governance records.
 *
 * Additive, in-memory, tenant-keyed; no migration. The milestone summary is
 * wired to CAPSTONE-060. Provide `GOVERNANCE_FINANCE_SOURCE` to enable the
 * financial summary; until then that section reports `source_not_configured`.
 */
@Module({
  imports: [ProjectMilestonesModule],
  controllers: [ProjectGovernanceExportController],
  providers: [
    ProjectGovernanceExportService,
    ProjectGovernanceExportRepository,
    GovernanceAuditService,
    MilestoneSummarySource,
    {
      provide: GOVERNANCE_MILESTONE_SOURCE,
      useExisting: MilestoneSummarySource,
    },
  ],
  exports: [ProjectGovernanceExportService],
})
export class ProjectGovernanceExportModule {}
