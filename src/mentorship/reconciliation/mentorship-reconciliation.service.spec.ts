import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MentorshipReconciliationService } from './mentorship-reconciliation.service';
import { CorrectionStatus } from './schemas/reconciliation.schema';

const telemetry = { count: jest.fn(), event: jest.fn(), warn: jest.fn() };
const FIN = { userId: 'f1', roles: ['finance'] };
const FIN2 = { userId: 'f2', roles: ['admin'] };

function make(mismatch: Record<string, unknown> | null) {
  const mismatches = {
    findById: jest.fn(() => ({ exec: async () => mismatch })),
    findOneAndUpdate: jest.fn((_q, u) => ({ exec: async () => (mismatch ? { ...mismatch, ...u.$set } : null) })),
  };
  return new MentorshipReconciliationService({} as never, mismatches as never, telemetry as never);
}

describe('MentorshipReconciliationService', () => {
  it('denies non-finance callers', async () => {
    const s = make(null);
    const nobody = { userId: 'u', roles: ['staff'] };
    await expect(s.run({ idempotencyKey: 'k'.repeat(8), periodLabel: 'p', internal: [], external: [] }, nobody)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.getRun('x', nobody)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks self sign-off and accepts a second signer', async () => {
    const s = make({ correctionStatus: CorrectionStatus.PROPOSED, proposedBy: 'f1' });
    await expect(s.signOff('m', { approve: true }, FIN)).rejects.toBeInstanceOf(ForbiddenException);
    const done = await s.signOff('m', { approve: true }, FIN2);
    expect(done.correctionStatus).toBe(CorrectionStatus.SIGNED_OFF);
  });

  it('refuses sign-off when nothing is proposed', async () => {
    const s = make({ correctionStatus: CorrectionStatus.NONE, proposedBy: null });
    await expect(s.signOff('m', { approve: true }, FIN2)).rejects.toBeInstanceOf(ConflictException);
  });
});
