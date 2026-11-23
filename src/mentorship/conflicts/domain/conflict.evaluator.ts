import { createHash } from 'crypto';
import { stableStringify } from '../../forms/domain/form-definition.validator';
import {
  CheckOutcome,
  CONFLICT_RULES_VERSION,
  ConflictCategory,
  ConflictFinding,
  ConflictSeverity,
  FINDING_MESSAGES,
} from '../conflict.constants';
import { ConflictFactsDto } from '../dto/conflict.dto';

export interface ConflictEvaluation {
  findings: ConflictFinding[];
  outcome: CheckOutcome;
  /** Private to staff; never placed in a finding or participant-facing view. */
  privateNotes: string | null;
  inputHash: string;
  rulesVersion: number;
}

/**
 * Deterministic, pure conflict evaluation (MENTOR-040).
 *
 * Organization overlaps are potential; reporting, review and financial
 * relationships are hard blockers; declared relationships take the severity
 * supplied by the declarant. Findings carry only codes and generic messages —
 * free text is separated into `privateNotes`.
 */
export function evaluateConflicts(input: {
  proposalId: string;
  mentorId: string;
  menteeId: string;
  programId?: string | null;
  facts: ConflictFactsDto;
}): ConflictEvaluation {
  const facts = input.facts ?? ({} as ConflictFactsDto);
  const findings: ConflictFinding[] = [];
  const push = (code: string, category: ConflictCategory, severity: ConflictSeverity): void => {
    findings.push({
      code,
      category,
      severity,
      publicMessage: FINDING_MESSAGES[code] ?? 'A conflict of interest was detected.',
    });
  };

  if (facts.sharedOrganizationId) push('ORG_SAME', ConflictCategory.ORGANIZATION, ConflictSeverity.POTENTIAL);
  if (facts.reportingRelationship) push('REPORTING_LINE', ConflictCategory.REPORTING, ConflictSeverity.HARD);
  if (facts.reviewRelationship) push('REVIEW_RELATIONSHIP', ConflictCategory.REVIEW, ConflictSeverity.HARD);
  if (facts.financialRelationship) push('FINANCIAL_RELATIONSHIP', ConflictCategory.FINANCIAL, ConflictSeverity.HARD);
  for (const relation of facts.declaredRelationships ?? []) {
    push(
      relation.severity === ConflictSeverity.HARD ? 'DECLARED_HARD' : 'DECLARED_POTENTIAL',
      ConflictCategory.DECLARED,
      relation.severity,
    );
  }

  const outcome = findings.some((f) => f.severity === ConflictSeverity.HARD)
    ? CheckOutcome.HARD
    : findings.length > 0
      ? CheckOutcome.POTENTIAL
      : CheckOutcome.CLEAR;

  const privateNotes = (facts.declaredRelationships ?? [])
    .map((r) => `${r.kind}: ${r.note}`)
    .join(' | ');

  // The hash covers the complete normalized input, including private text, so
  // an identical retry is recognized while any change yields a new version.
  const inputHash = createHash('sha256')
    .update(
      stableStringify({
        proposalId: input.proposalId,
        mentorId: input.mentorId,
        menteeId: input.menteeId,
        programId: input.programId ?? null,
        facts: {
          sharedOrganizationId: facts.sharedOrganizationId ?? null,
          reportingRelationship: Boolean(facts.reportingRelationship),
          reviewRelationship: Boolean(facts.reviewRelationship),
          financialRelationship: Boolean(facts.financialRelationship),
          declaredRelationships: (facts.declaredRelationships ?? []).map((r) => ({
            kind: r.kind,
            severity: r.severity,
            note: r.note,
          })),
        },
        rulesVersion: CONFLICT_RULES_VERSION,
      }),
    )
    .digest('hex');

  return { findings, outcome, privateNotes: privateNotes || null, inputHash, rulesVersion: CONFLICT_RULES_VERSION };
}
