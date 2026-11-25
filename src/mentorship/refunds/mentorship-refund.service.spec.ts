import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MentorshipRefundService } from './mentorship-refund.service';
import { RefundStatus } from './schemas/refund-calculation.schema';

const STAFF = { userId: 'staff-1', roles: ['staff'] };
const OTHER_STAFF = { userId: 'staff-2', roles: ['moderator'] };
const telemetry = { count: jest.fn(), event: jest.fn(), warn: jest.fn() };

function makeService(doc: Record<string, unknown> | null, port?: { transfer: jest.Mock }) {
  const model = {
    findById: jest.fn(() => ({ exec: async () => doc })),
    findOneAndUpdate: jest.fn((_q, update) => ({
      exec: async () => (doc ? { ...doc, ...update.$set } : null),
    })),
    findOne: jest.fn(() => ({ exec: async () => null })),
  };
  return {
    model,
    service: new MentorshipRefundService(model as never, telemetry as never, port as never),
  };
}

const base = {
  _id: 'r1',
  agreementId: 'a1',
  currency: 'USDC',
  heldAmountMinor: 1_000,
  refundMinor: 0,
  retainedMinor: 1_000,
  refundBps: 0,
  rule: 'late',
  policy: { version: 'v1' },
  exception: null,
  transferId: null,
  transferredAt: null,
};

describe('MentorshipRefundService', () => {
  it('denies non-staff callers on every operation', async () => {
    const { service } = makeService(base);
    const nobody = { userId: 'u', roles: ['student'] };
    await expect(service.get('r1', nobody)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.executeTransfer('r1', nobody)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.requestException('r1', { requestedRefundBps: 10_000, reason: 'goodwill gesture' }, nobody),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not let the requester approve their own exception', async () => {
    const { service } = makeService({
      ...base,
      status: RefundStatus.EXCEPTION_PENDING,
      exception: { requestedBy: 'staff-1', requestedRefundBps: 10_000 },
    });
    await expect(service.decideException('r1', { approve: true }, STAFF)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets a second staff member approve', async () => {
    const { service } = makeService({
      ...base,
      status: RefundStatus.EXCEPTION_PENDING,
      exception: { requestedBy: 'staff-1', requestedRefundBps: 10_000 },
    });
    const result = await service.decideException('r1', { approve: true }, OTHER_STAFF);
    expect(result.status).toBe(RefundStatus.EXCEPTION_APPROVED);
  });

  it('refuses to pay while an exception is pending', async () => {
    const { service } = makeService({ ...base, status: RefundStatus.EXCEPTION_PENDING });
    await expect(
      service.executeTransfer('r1', STAFF),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('pays an approved exception at the approved share, with a stable transfer id', async () => {
    const port = { transfer: jest.fn(async () => ({ providerRef: 'p' })) };
    const { service } = makeService(
      {
        ...base,
        status: RefundStatus.EXCEPTION_APPROVED,
        exception: { requestedBy: 'staff-1', requestedRefundBps: 5_000 },
      },
      port,
    );
    await service.executeTransfer('r1', STAFF);
    expect(port.transfer).toHaveBeenCalledWith(
      expect.objectContaining({ transferId: 'refund:r1', amountMinor: 500 }),
    );
  });

  it('does not pay again for an already transferred refund', async () => {
    const port = { transfer: jest.fn() };
    const { service } = makeService({ ...base, status: RefundStatus.TRANSFERRED, transferId: 'refund:r1' }, port);
    const result = await service.executeTransfer('r1', STAFF);
    expect(result.status).toBe(RefundStatus.TRANSFERRED);
    expect(port.transfer).not.toHaveBeenCalled();
  });
});
