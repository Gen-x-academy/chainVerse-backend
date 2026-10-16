import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  OutboxEvent,
  OutboxEventDocument,
  OutboxEventStatus,
  OutboxAggregateType,
} from '../schemas/outbox-event.schema';
import { OutboxService, OUTBOX_MAX_ATTEMPTS } from '../services/outbox.service';
import { DomainEvents } from '../../events/event-names';

/**
 * #1255 — the outbox is what makes a domain event survive the process dying
 * between the business write committing and the event being published. These
 * tests cover the parts of that contract which are easy to get subtly wrong and
 * hard to notice in production: the payload allowlist, the retry/dead-letter
 * arithmetic, and above all the claim, because a relay that double-publishes
 * re-delivers a state transition a consumer is entitled to treat as having
 * happened once.
 */
describe('OutboxService', () => {
  let service: OutboxService;
  let model: jest.Mocked<Model<OutboxEventDocument>>;
  let emitter: { emit: jest.Mock };

  const orgId = 'org-1';
  /** A staged row with every field `publishOne`/`envelope` reads. */
  const makeCandidate = (overrides: Record<string, unknown> = {}) => ({
    _id: 'outbox-1',
    eventId: 'evt-1',
    schemaVersion: 1,
    aggregateType: OutboxAggregateType.SCHOLARSHIP_AWARD,
    aggregateId: 'award-1',
    organizationId: orgId,
    status: OutboxEventStatus.PENDING,
    attempts: 0,
    nextAttemptAt: new Date(),
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    correlationId: null,
    lastError: null,
    eventName: DomainEvents.SCHOLARSHIP_AWARD_STATUS_CHANGED,
    payload: { awardId: 'award-1' },
    ...overrides,
  });

  const execResolved = (value: unknown) => ({
    exec: jest.fn().mockResolvedValue(value),
  });
  const execRejected = (error: Error) => ({
    exec: jest.fn().mockRejectedValue(error),
  });

  beforeEach(async () => {
    emitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        {
          provide: getModelToken(OutboxEvent.name),
          useValue: {
            create: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
            updateOne: jest.fn(),
            deleteMany: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();

    service = module.get(OutboxService);
    model = module.get(getModelToken(OutboxEvent.name));
  });

  describe('stage', () => {
    it('refuses a payload carrying a field outside the per-event allowlist', async () => {
      // The outbox collection is read by the relay and is not tenant-partitioned,
      // so a free-text `note` or an email address would be a privacy incident
      // that outlives the aggregate it came from. Rejecting at stage time means
      // the bad payload never reaches the collection at all.
      await expect(
        service.stage({
          organizationId: orgId,
          aggregateType: OutboxAggregateType.SCHOLARSHIP_AWARD,
          aggregateId: 'award-1',
          eventName: DomainEvents.SCHOLARSHIP_AWARD_STATUS_CHANGED,
          payload: {
            awardId: 'award-1',
            status: 'ACTIVE',
            applicantEmail: 'student@example.com',
          },
        }),
      ).rejects.toThrow(/allowlist/i);
    });

    it('accepts the reservation payload the award service stages', async () => {
      // The award service settles a nested reservation inside the award's own
      // transaction and stages this exact shape. The allowlist lives in a
      // different file from that call site, so a field added on one side and not
      // the other would throw at runtime — inside a transaction, on every award
      // transition. Pinning the payload here makes that a test failure instead.
      (model.create as jest.Mock).mockImplementation(
        jest.fn().mockReturnValue([{ _id: 'outbox-1' }]),
      );

      await expect(
        service.stage({
          organizationId: orgId,
          aggregateType: OutboxAggregateType.BUDGET_RESERVATION,
          aggregateId: 'res-1',
          eventName: DomainEvents.SCHOLARSHIP_BUDGET_RESERVATION_CHANGED,
          payload: {
            reservationId: 'res-1',
            organizationId: orgId,
            programId: 'prog-1',
            applicationId: 'app-1',
            status: 'expired',
            amount: 50_000,
            currency: 'USD',
          },
        }),
      ).resolves.toMatchObject({ _id: 'outbox-1' });
    });

    it('accepts an allowlisted payload and stamps ids for correlation and dedupe', async () => {
      const created = jest.fn().mockReturnValue([{ _id: 'outbox-1' }]);
      (model.create as jest.Mock).mockImplementation(created);

      await service.stage({
        organizationId: orgId,
        aggregateType: OutboxAggregateType.SCHOLARSHIP_AWARD,
        aggregateId: 'award-1',
        eventName: DomainEvents.SCHOLARSHIP_AWARD_STATUS_CHANGED,
        payload: { awardId: 'award-1', status: 'ACTIVE', amount: 5000 },
      });

      expect(created).toHaveBeenCalledTimes(1);
      const [docs] = created.mock.calls[0];
      expect(docs[0]).toMatchObject({
        organizationId: orgId,
        eventName: DomainEvents.SCHOLARSHIP_AWARD_STATUS_CHANGED,
        status: OutboxEventStatus.PENDING,
        attempts: 0,
      });
      // A consumer dedupes on eventId, so the relay must always have one even
      // when the caller did not supply it.
      expect(typeof docs[0].eventId).toBe('string');
      expect(docs[0].eventId.length).toBeGreaterThan(0);
    });
  });

  describe('claim', () => {
    it('claims a row with a compare-and-set on the attempt counter', async () => {
      // The filter is the whole point. If it only said `status: PENDING`, two
      // relays that both read the row would both match it and both publish,
      // because the update does not change `status`. Pinning `attempts` means the
      // first relay's increment invalidates the second relay's filter.
      const candidate = makeCandidate({ attempts: 2 });
      (model.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([candidate]),
      });
      (model.findOneAndUpdate as jest.Mock).mockReturnValue(
        execResolved(candidate),
      );
      (model.updateOne as jest.Mock).mockReturnValue(
        execResolved({ modifiedCount: 1 }),
      );

      const published = await service.publishDue(10);

      expect(published).toBe(1);
      const [filter] = (model.findOneAndUpdate as jest.Mock).mock.calls[0];
      expect(filter).toMatchObject({
        _id: 'outbox-1',
        status: OutboxEventStatus.PENDING,
        attempts: 2,
      });
    });

    it('publishes nothing when the claim loses the race', async () => {
      // Simulates the other relay winning: our findOneAndUpdate matches no row
      // and returns null. The event must stay PENDING for that relay to publish,
      // and we must not emit locally.
      const candidate = makeCandidate();
      (model.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([candidate]),
      });
      (model.findOneAndUpdate as jest.Mock).mockReturnValue(execResolved(null));

      const published = await service.publishDue(10);

      expect(published).toBe(0);
      expect(emitter.emit).not.toHaveBeenCalled();
    });

    it('marks the row PUBLISHED and re-parks it only after the emit succeeds', async () => {
      // The success update is what stops the next sweep re-reading the row. It
      // must be conditional on the row still being PENDING, so a row that was
      // dead-lettered mid-flight is not resurrected as PUBLISHED.
      const candidate = makeCandidate();
      (model.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([candidate]),
      });
      (model.findOneAndUpdate as jest.Mock).mockReturnValue(
        execResolved(candidate),
      );
      (model.updateOne as jest.Mock).mockReturnValue(
        execResolved({ modifiedCount: 1 }),
      );

      await service.publishDue(10);

      const successCall = (model.updateOne as jest.Mock).mock.calls.at(-1);
      expect(successCall[0]).toMatchObject({
        _id: 'outbox-1',
        status: OutboxEventStatus.PENDING,
      });
      expect(successCall[1].$set).toMatchObject({
        status: OutboxEventStatus.PUBLISHED,
      });
      expect(successCall[1].$set.publishedAt).toBeInstanceOf(Date);
    });
  });

  describe('failure handling', () => {
    beforeEach(() => {
      (model.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([makeCandidate()]),
      });
      (model.updateOne as jest.Mock).mockReturnValue(
        execResolved({ modifiedCount: 1 }),
      );
    });

    it('leaves the row PENDING and records the error when the emit throws', async () => {
      // A throw from a listener must not consume the attempt silently, and must
      // not mark the row PUBLISHED — otherwise the event is lost with no trace,
      // which is the exact failure an outbox is installed to prevent.
      (model.findOneAndUpdate as jest.Mock).mockReturnValue(
        execResolved(makeCandidate()),
      );
      emitter.emit.mockImplementation(() => {
        throw new Error('listener exploded');
      });

      const published = await service.publishDue(10);

      expect(published).toBe(0);
      const [filter, update] =
        (model.updateOne as jest.Mock).mock.calls.at(-1) ?? [];
      // PENDING, not PUBLISHED or DEAD_LETTERED.
      expect(filter).toMatchObject({
        _id: 'outbox-1',
        status: OutboxEventStatus.PENDING,
      });
      expect(update.$set.lastError).toMatch(/listener exploded/);
    });

    it('dead-letters once the attempt budget is exhausted and stops retrying', async () => {
      // One past the limit: dead-letter instead of attempting an
      // (OUTBOX_MAX_ATTEMPTS + 1)th time, and record the attempt count so the
      // alert can say how hard it tried.
      // The attempt counter is read from the row `find` returned — the same value
      // the claim's compare-and-set pins — so the row must already be at the
      // limit there. One more is the attempt that trips the cut-off.
      const exhausted = makeCandidate({ attempts: OUTBOX_MAX_ATTEMPTS });
      (model.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([exhausted]),
      });
      (model.findOneAndUpdate as jest.Mock).mockReturnValue(
        execResolved(exhausted),
      );
      emitter.emit.mockImplementation(() => {
        throw new Error('still broken');
      });

      const published = await service.publishDue(10);

      expect(published).toBe(0);
      // Cut off before emitting: there is no point handing an event to a listener
      // that has already failed MAX times, and doing so could half-apply it.
      expect(emitter.emit).not.toHaveBeenCalled();
      const [filter, update] =
        (model.updateOne as jest.Mock).mock.calls.at(-1) ?? [];
      expect(filter).toMatchObject({ _id: 'outbox-1' });
      expect(update.$set).toMatchObject({ status: OutboxEventStatus.DEAD });
      expect(update.$set.deadLetteredAt).toBeInstanceOf(Date);
    });

    it('lets publishDue propagate an infrastructure error to its caller', async () => {
      // Deliberately not swallowed here. `publishDue` is also called by operator
      // tooling, and a drain that reported "0 published" while the database was
      // unreachable would be indistinguishable from an idle queue. The relay job
      // is where the error is caught and turned into a log line.
      (model.findOneAndUpdate as jest.Mock).mockReturnValue(
        execRejected(new Error('mongo write concern error')),
      );

      await expect(service.publishDue(10)).rejects.toThrow(
        /mongo write concern error/,
      );
    });
  });
});
