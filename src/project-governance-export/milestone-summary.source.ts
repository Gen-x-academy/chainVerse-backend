import { Injectable } from '@nestjs/common';
import { MilestoneStatus } from '../project-milestones/project-milestones.types';
import { ProjectMilestonesService } from '../project-milestones/project-milestones.service';
import {
  GovernanceActor,
  GovernanceMilestoneSource,
  MilestoneSummary,
} from './project-governance-export.types';

/**
 * Real adapter over CAPSTONE-060. Calls the milestones service as the
 * requester, so its own authorization still applies, and reduces the result to
 * counts and a due date. Titles, reviewers and private fields never leave it.
 */
@Injectable()
export class MilestoneSummarySource implements GovernanceMilestoneSource {
  constructor(private readonly milestones: ProjectMilestonesService) {}

  async summarize(input: {
    tenantId: string;
    projectId: string;
    actor: GovernanceActor;
  }): Promise<MilestoneSummary> {
    const list = await this.milestones.listMilestones(
      input.actor,
      input.tenantId,
      input.projectId,
    );
    const byStatus: Record<string, number> = {};
    for (const m of list) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
    const open = list
      .filter(
        (m) =>
          m.status === MilestoneStatus.DRAFT ||
          m.status === MilestoneStatus.ACTIVE,
      )
      .map((m) => m.dueDate)
      .sort();
    return { total: list.length, byStatus, nextDueDate: open[0] ?? null };
  }
}
