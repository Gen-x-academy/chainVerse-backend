import { VerificationService } from './verification.service';
import { VerificationStatus } from './interfaces/verification.interface';

describe('VerificationService', () => {
  let service: VerificationService;
  let logModel: {
    create: jest.Mock;
    find: jest.Mock;
    aggregate: jest.Mock;
  };

  const findResult = (docs: unknown[]) => ({
    sort: jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(docs),
      }),
    }),
  });

  beforeEach(() => {
    logModel = {
      create: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockReturnValue(findResult([])),
      aggregate: jest.fn().mockResolvedValue([]),
    };

    service = new VerificationService(logModel as any);
  });

  it('records a VALID scan and returns a valid result', async () => {
    const result = await service.verifyTicket({
      ticketCode: 'TICKET-1',
      eventId: 'event-1',
      verifierId: 'staff-1',
    });

    expect(logModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketCode: 'TICKET-1',
        eventId: 'event-1',
        verifierId: 'staff-1',
        status: VerificationStatus.VALID,
      }),
    );
    expect(result.status).toBe(VerificationStatus.VALID);
    expect(result.isValid).toBe(true);
    expect(result.verifiedBy).toBe('staff-1');
  });

  it('records an INVALID scan', async () => {
    const result = await service.invalidate({
      ticketCode: 'TICKET-2',
      eventId: 'event-1',
    });

    expect(logModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: VerificationStatus.INVALID }),
    );
    expect(result.isValid).toBe(false);
    expect(result.message).toBe('Invalid ticket. Entry denied.');
  });

  it('defaults optional event, ticket and verifier values', async () => {
    const result = await service.logVerification({
      ticketCode: 'TICKET-3',
      status: VerificationStatus.EXPIRED,
      message: 'Ticket has expired.',
    });

    expect(logModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'unknown',
        verifierId: null,
        ticketId: null,
      }),
    );
    expect(result.eventId).toBe('unknown');
    expect(result.verifiedBy).toBeNull();
  });

  it('maps stored log documents when loading an event', async () => {
    logModel.find.mockReturnValue(
      findResult([
        {
          _id: { toString: () => 'log-1' },
          ticketCode: 'TICKET-1',
          eventId: 'event-1',
          status: VerificationStatus.VALID,
          message: 'ok',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]),
    );

    const logs = await service.getLogsForEvent('event-1');

    expect(logModel.find).toHaveBeenCalledWith({ eventId: 'event-1' });
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe('log-1');
    expect(logs[0].ticketId).toBeNull();
  });

  it('returns zero-filled stats when no scans exist', async () => {
    const stats = await service.getStatsForEvent('event-1');

    expect(stats.total).toBe(0);
    expect(stats.valid).toBe(0);
    expect(stats.byStatus[VerificationStatus.CANCELLED]).toBe(0);
  });

  it('aggregates scan counts by status', async () => {
    logModel.aggregate.mockResolvedValue([
      { _id: VerificationStatus.VALID, count: 3 },
      { _id: VerificationStatus.INVALID, count: 2 },
    ]);

    const stats = await service.getStatsForEvent('event-1');

    expect(stats).toMatchObject({
      eventId: 'event-1',
      total: 5,
      valid: 3,
      invalid: 2,
      alreadyUsed: 0,
    });
  });

  it('falls back to a generic message for an unknown status', () => {
    expect(service.getStatusMessage('UNKNOWN' as VerificationStatus)).toBe(
      'Unknown verification status.',
    );
  });
});
