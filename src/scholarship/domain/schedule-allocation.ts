import { BASIS_POINTS_TOTAL, MilestoneType } from '../scholarship.constants';

export interface MilestoneDefinitionInput {
  key: string;
  type: MilestoneType;
  title: string;
  description?: string;
  percentageBps: number;
  amountMinor?: number;
  dueDate: Date;
}

export interface AllocatedMilestone {
  key: string;
  type: MilestoneType;
  title: string;
  description: string | null;
  percentageBps: number;
  amountMinor: number;
  dueDate: Date;
  sequence: number;
}

export interface AwardAllocationContext {
  totalAmountMinor: number;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

/**
 * Validates milestone definitions against an award and returns the canonical,
 * fully reconciled allocation.
 *
 * Amounts are derived from basis points so they always sum exactly to the
 * award: every milestone but the last receives `floor(total * bps / 10000)`
 * and the last absorbs the rounding remainder. A caller-supplied `amountMinor`
 * is accepted only when it equals the derived value, which catches clients
 * that computed a different split.
 *
 * Returns a list of human-readable violations instead of throwing so the
 * caller can report every problem at once.
 */
export function allocateSchedule(
  award: AwardAllocationContext,
  milestones: MilestoneDefinitionInput[],
): { milestones: AllocatedMilestone[]; errors: string[] } {
  const errors: string[] = [];

  if (milestones.length === 0) {
    return { milestones: [], errors: ['At least one milestone is required'] };
  }

  const seenKeys = new Set<string>();
  for (const m of milestones) {
    if (seenKeys.has(m.key)) errors.push(`Duplicate milestone key "${m.key}"`);
    seenKeys.add(m.key);
    if (m.type === MilestoneType.CUSTOM && !m.description?.trim()) {
      errors.push(`Custom milestone "${m.key}" requires a description`);
    }
  }

  const bpsTotal = milestones.reduce((sum, m) => sum + m.percentageBps, 0);
  if (bpsTotal !== BASIS_POINTS_TOTAL) {
    errors.push(
      `Milestone percentages must total ${BASIS_POINTS_TOTAL} basis points (100%); got ${bpsTotal}`,
    );
  }

  for (let i = 1; i < milestones.length; i++) {
    if (
      milestones[i].dueDate.getTime() <= milestones[i - 1].dueDate.getTime()
    ) {
      errors.push(
        `Milestone "${milestones[i].key}" is due on or before "${milestones[i - 1].key}"; due dates must be strictly increasing`,
      );
    }
  }

  for (const m of milestones) {
    if (award.periodStart && m.dueDate < award.periodStart) {
      errors.push(`Milestone "${m.key}" is due before the award period starts`);
    }
    if (award.periodEnd && m.dueDate > award.periodEnd) {
      errors.push(`Milestone "${m.key}" is due after the award period ends`);
    }
  }

  if (errors.length > 0) return { milestones: [], errors };

  // BigInt keeps `total * bps` exact for any safe-integer award amount.
  const total = BigInt(award.totalAmountMinor);
  let allocated = BigInt(0);
  const result: AllocatedMilestone[] = milestones.map((m, index) => {
    const isLast = index === milestones.length - 1;
    const amount = isLast
      ? total - allocated
      : (total * BigInt(m.percentageBps)) / BigInt(BASIS_POINTS_TOTAL);
    allocated += amount;
    return {
      key: m.key,
      type: m.type,
      title: m.title,
      description: m.description?.trim() || null,
      percentageBps: m.percentageBps,
      amountMinor: Number(amount),
      dueDate: m.dueDate,
      sequence: index,
    };
  });

  result.forEach((m, index) => {
    if (m.amountMinor <= 0) {
      errors.push(`Milestone "${m.key}" allocates no funds`);
    }
    const requested = milestones[index].amountMinor;
    if (requested !== undefined && requested !== m.amountMinor) {
      errors.push(
        `Milestone "${m.key}" amount ${requested} does not reconcile with its percentage (expected ${m.amountMinor})`,
      );
    }
  });

  return errors.length > 0
    ? { milestones: [], errors }
    : { milestones: result, errors };
}

/** True when two milestone definitions are financially and semantically identical. */
export function sameMilestoneTerms(
  a: Pick<AllocatedMilestone, 'key' | 'type' | 'amountMinor' | 'percentageBps'>,
  b: Pick<AllocatedMilestone, 'key' | 'type' | 'amountMinor' | 'percentageBps'>,
): boolean {
  return (
    a.key === b.key &&
    a.type === b.type &&
    a.amountMinor === b.amountMinor &&
    a.percentageBps === b.percentageBps
  );
}
