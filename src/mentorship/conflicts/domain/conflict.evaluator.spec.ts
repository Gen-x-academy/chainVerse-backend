import {
  CheckOutcome,
  ConflictSeverity,
} from '../conflict.constants';
import { evaluateConflicts } from './conflict.evaluator';

const BASE = {
  proposalId: 'p'.repeat(24),
  mentorId: 'm'.repeat(24),
  menteeId: 's'.repeat(24),
};

describe('evaluateConflicts (MENTOR-040)', () => {
  it('returns a clear outcome with no findings', () => {
    const result = evaluateConflicts({ ...BASE, facts: {} });
    expect(result.outcome).toBe(CheckOutcome.CLEAR);
    expect(result.findings).toEqual([]);
    expect(result.privateNotes).toBeNull();
  });

  it('treats a reporting relationship as a hard blocker with a public message', () => {
    const result = evaluateConflicts({
      ...BASE,
      facts: { reportingRelationship: true },
    });
    expect(result.outcome).toBe(CheckOutcome.HARD);
    expect(result.findings).toEqual([
      expect.objectContaining({ code: 'REPORTING_LINE', severity: ConflictSeverity.HARD }),
    ]);
    expect(result.findings[0].publicMessage).toBeTruthy();
  });

  it('keeps declared free text out of findings', () => {
    const note = 'Private family detail';
    const result = evaluateConflicts({
      ...BASE,
      facts: {
        sharedOrganizationId: 'org-1',
        declaredRelationships: [{ kind: 'family', severity: ConflictSeverity.POTENTIAL, note }],
      },
    });
    expect(result.outcome).toBe(CheckOutcome.POTENTIAL);
    expect(result.privateNotes).toContain(note);
    expect(JSON.stringify(result.findings)).not.toContain(note);
  });

  it('hashes equivalent inputs identically, independent of key order', () => {
    const a = evaluateConflicts({ ...BASE, facts: { reportingRelationship: true } });
    const b = evaluateConflicts({
      menteeId: BASE.menteeId,
      mentorId: BASE.mentorId,
      proposalId: BASE.proposalId,
      facts: { reportingRelationship: true },
    });
    expect(a.inputHash).toBe(b.inputHash);
    const c = evaluateConflicts({ ...BASE, facts: { financialRelationship: true } });
    expect(c.inputHash).not.toBe(a.inputHash);
  });
});
