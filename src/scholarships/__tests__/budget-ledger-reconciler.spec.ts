import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BudgetLedger,
  BudgetLedgerDocument,
  BudgetReservation,
  BudgetReservationDocument,
  ReservationStatus,
} from '../schemas/budget-reservation.schema';
import { BudgetLedgerReconciler } from '../services/budget-ledger-reconciler.service';
import { OutboxService } from '../../scholarship-outbox/services/outbox.service';
import { ScholarshipTransactionRunner } from '../../scholarship-outbox/services/scholarship-transaction.runner';

/**
 * #1255 — the budget ledger's `reservedAmount`/`disbursedAmount` are derived
 * from reservations, so any write that moves one without the other is drift.
 * Reconciliation is what makes the invariant self-healing, which means its own
 * failure modes are the interesting ones: a case it declines to look at is
 * indistinguishable, from the outside, from there being nothing wrong.
 */
describe('BudgetLedgerReconciler', () => {
  let reconciler: BudgetLedgerReconciler;
  let ledgerModel: jest.Mocked<Model<BudgetLedgerDocument>>;
  let reservationModel: jest.Mocked<Model<BudgetReservationDocument>>;
  let outbox: { stage: jest.Mock };
  let transactions: { run: jest.Mock };

  const orgId = 'org-1';
  const programId = new Types.ObjectId('507f1f77bcf86cd799439011');

  const ledger = (overrides: Record<string, unknown> = {}) => ({
    _id: 'ledger-1',
    organizationId: orgId,
    programId,
    reservedAmount: 0,
    disbursedAmount: 0,
    ...overrides,
  });

  /** Rows as Mongo's `$group` returns them: the group key lands in `_id`. */
  const aggregateResult = (
    rows: Array<[ReservationStatus, number, number]>,
  ) => ({
    exec: jest
      .fn()
      .mockResolvedValue(
        rows.map(([status, total, count]) => ({ _id: status, total, count })),
      ),
  });

  beforeEach(async () => {
    outbox = { stage: jest.fn().mockResolvedValue(undefined) };
    transactions = {
      run: jest.fn((_label: string, work: (s: null) => unknown) => work(null)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetLedgerReconciler,
        {
          provide: getModelToken(BudgetLedger.name),
          useValue: { find: jest.fn(), updateOne: jest.fn() },
        },
        {
          provide: getModelToken(BudgetReservation.name),
          useValue: { aggregate: jest.fn() },
        },
        { provide: OutboxService, useValue: outbox },
        { provide: ScholarshipTransactionRunner, useValue: transactions },
      ],
    }).compile();

    reconciler = module.get(BudgetLedgerReconciler);
    ledgerModel = module.get(getModelToken(BudgetLedger.name));
    reservationModel = module.get(getModelToken(BudgetReservation.name));
  });

  it('repairs a ledger still holding totals after every reservation was released', async () => {
    // The case that motivated dropping an early `rows.length === 0` return.
    // "No reservations" is an answer, not an absence of one: the ledger must be
    // zero. Skipping it left a program permanently reported as over-committed,
    // blocking new awards, with every reservation correctly closed.
    (ledgerModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest
        .fn()
        .mockResolvedValue([
          ledger({ reservedAmount: 50_000, disbursedAmount: 25_000 }),
        ]),
    });
    (reservationModel.aggregate as jest.Mock).mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    });
    (ledgerModel.updateOne as jest.Mock).mockReturnValue({
      exec: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    });

    const drift = await reconciler.reconcileAll();

    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({
      reservedAmount: 50_000,
      expectedReservedAmount: 0,
      disbursedAmount: 25_000,
      expectedDisbursedAmount: 0,
    });
    const [, update] = (ledgerModel.updateOne as jest.Mock).mock.calls[0];
    expect(update.$set).toMatchObject({
      reservedAmount: 0,
      disbursedAmount: 0,
    });
  });

  it('recomputes from reservations that are still live', async () => {
    (ledgerModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([ledger({ reservedAmount: 10_000 })]),
    });
    (reservationModel.aggregate as jest.Mock).mockReturnValue(
      aggregateResult([
        [ReservationStatus.PENDING, 75_000, 3],
        [ReservationStatus.CONFIRMED, 20_000, 1],
        [ReservationStatus.RELEASED, 999_999, 4],
      ]),
    );
    (ledgerModel.updateOne as jest.Mock).mockReturnValue({
      exec: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    });

    await reconciler.reconcileAll();

    const [, update] = (ledgerModel.updateOne as jest.Mock).mock.calls[0];
    expect(update.$set).toMatchObject({
      reservedAmount: 75_000,
      // Released reservations must not count toward either total.
      disbursedAmount: 20_000,
    });
  });

  it('leaves an already-consistent ledger alone', async () => {
    (ledgerModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest
        .fn()
        .mockResolvedValue([
          ledger({ reservedAmount: 75_000, disbursedAmount: 20_000 }),
        ]),
    });
    (reservationModel.aggregate as jest.Mock).mockReturnValue(
      aggregateResult([
        [ReservationStatus.PENDING, 75_000, 3],
        [ReservationStatus.CONFIRMED, 20_000, 1],
      ]),
    );

    const drift = await reconciler.reconcileAll();

    expect(drift).toEqual([]);
    expect(ledgerModel.updateOne).not.toHaveBeenCalled();
    expect(outbox.stage).not.toHaveBeenCalled();
  });

  it('does not clobber a ledger that legitimately moved during the pass', async () => {
    // The repair is conditional on the totals still being the ones diagnosed, so
    // a concurrent real movement wins and is not mistaken for drift to undo.
    (ledgerModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([ledger({ reservedAmount: 10_000 })]),
    });
    (reservationModel.aggregate as jest.Mock).mockReturnValue(
      aggregateResult([[ReservationStatus.PENDING, 75_000, 3]]),
    );
    (ledgerModel.updateOne as jest.Mock).mockReturnValue({
      exec: jest.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
    });

    await reconciler.reconcileAll();

    expect(outbox.stage).not.toHaveBeenCalled();
  });
});
