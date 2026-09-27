import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ScholarshipFinanceStatementService } from '../scholarship-finance-statement.service';
import {
  FinanceStatement,
  StatementExportStatus,
} from '../schemas/finance-statement.schema';
import { LedgerJournal } from '../../scholarship-finance/schemas/ledger-journal.schema';
import { SponsorDeposit } from '../../scholarship-finance/schemas/sponsor-deposit.schema';
import { Refund } from '../../scholarship-finance/schemas/refund.schema';
import { RecoveryClaim } from '../../scholarship-finance/schemas/recovery-claim.schema';
import { BudgetReservation } from '../../scholarships/schemas/budget-reservation.schema';
import {
  BusinessRuleException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';

// ── Helpers ───────────────────────────────────────────────────────────────────

const oid = () => new Types.ObjectId().toHexString();

function buildModel() {
  return {
    find: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    countDocuments: jest.fn().mockReturnThis(),
    updateMany: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn(),
    create: jest.fn(),
  };
}

function makeSaveableDoc(overrides: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = {
    _id: new Types.ObjectId(),
    organizationId: oid(),
    programId: null,
    periodStart: new Date('2025-01-01'),
    periodEnd: new Date('2025-03-31'),
    status: StatementExportStatus.PENDING,
    currency: 'USD',
    openingBalanceMinor: 0,
    closingBalanceMinor: 0,
    totalCreditsMinor: 0,
    totalDebitsMinor: 0,
    reconciled: false,
    reconciliationNote: null,
    lineItems: [],
    requestedBy: oid(),
    completedAt: null,
    errorMessage: null,
    expiresAt: null,
    createdAt: new Date(),
    ...overrides,
  };
  doc['save'] = jest.fn().mockImplementation(() => Promise.resolve(doc));
  return doc;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ScholarshipFinanceStatementService', () => {
  let service: ScholarshipFinanceStatementService;
  let statementModel: ReturnType<typeof buildModel>;
  let journalModel: ReturnType<typeof buildModel>;
  let depositModel: ReturnType<typeof buildModel>;
  let refundModel: ReturnType<typeof buildModel>;
  let recoveryModel: ReturnType<typeof buildModel>;
  let reservationModel: ReturnType<typeof buildModel>;

  const ORG_ID = oid();
  const ACTOR_ID = oid();

  beforeEach(async () => {
    statementModel = buildModel();
    journalModel = buildModel();
    depositModel = buildModel();
    refundModel = buildModel();
    recoveryModel = buildModel();
    reservationModel = buildModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScholarshipFinanceStatementService,
        { provide: getModelToken(FinanceStatement.name), useValue: statementModel },
        { provide: getModelToken(LedgerJournal.name), useValue: journalModel },
        { provide: getModelToken(SponsorDeposit.name), useValue: depositModel },
        { provide: getModelToken(Refund.name), useValue: refundModel },
        { provide: getModelToken(RecoveryClaim.name), useValue: recoveryModel },
        { provide: getModelToken(BudgetReservation.name), useValue: reservationModel },
      ],
    }).compile();

    service = module.get(ScholarshipFinanceStatementService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── generateStatement ───────────────────────────────────────────────────────

  describe('generateStatement', () => {
    const validDto = {
      organizationId: ORG_ID,
      periodStart: '2025-01-01',
      periodEnd: '2025-03-31',
    };

    it('throws ValidationDomainException when periodStart >= periodEnd', async () => {
      await expect(
        service.generateStatement(ACTOR_ID, {
          ...validDto,
          periodStart: '2025-04-01',
          periodEnd: '2025-01-01',
        }),
      ).rejects.toThrow(ValidationDomainException);
    });

    it('throws BusinessRuleException when an in-progress export already exists', async () => {
      statementModel.exec.mockResolvedValueOnce({ _id: oid(), status: StatementExportStatus.PENDING });

      await expect(service.generateStatement(ACTOR_ID, validDto)).rejects.toThrow(
        BusinessRuleException,
      );
    });

    it('creates a PENDING document and returns it for large periods (async path)', async () => {
      // No in-progress statement
      statementModel.exec.mockResolvedValueOnce(null);
      // Estimate line items > INLINE_LIMIT (500) — return 600 total
      depositModel.exec.mockResolvedValueOnce(200);
      refundModel.exec.mockResolvedValueOnce(200);
      recoveryModel.exec.mockResolvedValueOnce(100);
      reservationModel.exec.mockResolvedValueOnce(100);

      const created = makeSaveableDoc({ status: StatementExportStatus.PENDING });
      statementModel.create.mockResolvedValueOnce(created);

      const result = await service.generateStatement(ACTOR_ID, validDto);

      expect(statementModel.create).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(StatementExportStatus.PENDING);
    });

    it('computes inline and returns READY for small periods (≤ 500 line items)', async () => {
      // No in-progress statement
      statementModel.exec.mockResolvedValueOnce(null);
      // Estimate → 3 total items (well under 500)
      depositModel.exec.mockResolvedValueOnce(1);
      refundModel.exec.mockResolvedValueOnce(1);
      recoveryModel.exec.mockResolvedValueOnce(1);
      reservationModel.exec.mockResolvedValueOnce(0);

      const doc = makeSaveableDoc({ status: StatementExportStatus.PENDING });
      statementModel.create.mockResolvedValueOnce(doc);

      // computeStatement sources
      depositModel.exec.mockResolvedValueOnce([
        {
          _id: new Types.ObjectId(),
          createdAt: new Date('2025-01-15'),
          source: { rail: 'stellar' },
          assetKey: 'USD:GXXX',
          grossMinor: 10000,
          netMinor: 9800,
          fee: { platformFeeMinor: 150, networkFeeMinor: 50 },
        },
      ]);
      refundModel.exec.mockResolvedValueOnce([]);
      reservationModel.exec.mockResolvedValueOnce([]);
      recoveryModel.exec.mockResolvedValueOnce([]);
      journalModel.exec.mockResolvedValueOnce([]);

      const result = await service.generateStatement(ACTOR_ID, validDto);

      expect((result as Record<string, unknown>)['save']).toHaveBeenCalled();
      // Status should be READY after inline compute
      expect(result.status).toBe(StatementExportStatus.READY);
    });
  });

  // ── computeStatement ────────────────────────────────────────────────────────

  describe('computeStatement', () => {
    it('sets status READY and populates line items for a valid period', async () => {
      const doc = makeSaveableDoc();

      depositModel.exec.mockResolvedValueOnce([
        {
          _id: new Types.ObjectId(),
          createdAt: new Date('2025-02-01'),
          source: { rail: 'bank_transfer' },
          assetKey: 'USD:bank',
          grossMinor: 5000,
          netMinor: 4900,
          fee: null,
        },
      ]);
      refundModel.exec.mockResolvedValueOnce([
        {
          _id: new Types.ObjectId(),
          completedAt: new Date('2025-02-10'),
          createdAt: new Date('2025-02-05'),
          reason: 'Overpayment',
          assetKey: 'USD:bank',
          amountMinor: 500,
        },
      ]);
      reservationModel.exec.mockResolvedValueOnce([]);
      recoveryModel.exec.mockResolvedValueOnce([]);
      journalModel.exec.mockResolvedValueOnce([]);

      const result = await service.computeStatement(doc as unknown as ReturnType<typeof makeSaveableDoc> & { save: jest.Mock });

      expect(result.status).toBe(StatementExportStatus.READY);
      expect(result.lineItems.length).toBeGreaterThanOrEqual(2); // deposit + refund
      // Credits: 4900, Debits: 500 → closing = 4400
      expect(result.totalCreditsMinor).toBe(4900);
      expect(result.totalDebitsMinor).toBe(500);
      expect(result.closingBalanceMinor).toBe(4400);
      expect(result.reconciled).toBe(true);
    });

    it('sets status FAILED and stores errorMessage when no entries found', async () => {
      const doc = makeSaveableDoc();

      depositModel.exec.mockResolvedValueOnce([]);
      refundModel.exec.mockResolvedValueOnce([]);
      reservationModel.exec.mockResolvedValueOnce([]);
      recoveryModel.exec.mockResolvedValueOnce([]);
      journalModel.exec.mockResolvedValueOnce([]);

      await expect(
        service.computeStatement(doc as unknown as ReturnType<typeof makeSaveableDoc> & { save: jest.Mock }),
      ).rejects.toThrow(BusinessRuleException);

      expect(doc.status).toBe(StatementExportStatus.FAILED);
      expect(doc.errorMessage).toBeTruthy();
    });

    it('sets reconciliationWarning note when running balance diverges from computed closing', async () => {
      const doc = makeSaveableDoc();

      // Two deposits in different currencies → triggers currency mismatch
      depositModel.exec.mockResolvedValueOnce([
        {
          _id: new Types.ObjectId(),
          createdAt: new Date('2025-02-01'),
          source: { rail: 'stellar' },
          assetKey: 'USD:GXX',
          grossMinor: 1000,
          netMinor: 1000,
          fee: null,
        },
        {
          _id: new Types.ObjectId(),
          createdAt: new Date('2025-02-02'),
          source: { rail: 'stellar' },
          assetKey: 'EUR:GXX',  // different currency
          grossMinor: 500,
          netMinor: 500,
          fee: null,
        },
      ]);
      refundModel.exec.mockResolvedValueOnce([]);
      reservationModel.exec.mockResolvedValueOnce([]);
      recoveryModel.exec.mockResolvedValueOnce([]);
      journalModel.exec.mockResolvedValueOnce([]);

      await expect(
        service.computeStatement(doc as unknown as ReturnType<typeof makeSaveableDoc> & { save: jest.Mock }),
      ).rejects.toThrow(BusinessRuleException);

      expect(doc.status).toBe(StatementExportStatus.FAILED);
    });

    it('is a no-op when statement is already READY', async () => {
      const doc = makeSaveableDoc({ status: StatementExportStatus.READY });

      const result = await service.computeStatement(doc as unknown as ReturnType<typeof makeSaveableDoc> & { save: jest.Mock });

      expect(result.status).toBe(StatementExportStatus.READY);
      expect((doc as Record<string, unknown>)['save']).not.toHaveBeenCalled();
      expect(depositModel.exec).not.toHaveBeenCalled();
    });
  });

  // ── getStatement ────────────────────────────────────────────────────────────

  describe('getStatement', () => {
    it('returns the full response DTO for a READY statement', async () => {
      const statementId = oid();
      const doc = makeSaveableDoc({
        status: StatementExportStatus.READY,
        totalCreditsMinor: 5000,
        totalDebitsMinor: 1000,
        closingBalanceMinor: 4000,
        reconciled: true,
        lineItems: [
          {
            occurredAt: new Date(),
            eventType: 'deposit_credit',
            sourceId: oid(),
            sourceType: 'Sponsor Deposit',
            creditMinor: 5000,
            debitMinor: 0,
            runningBalanceMinor: 5000,
            currency: 'USD',
          },
        ],
      });
      statementModel.exec.mockResolvedValueOnce(doc);

      const result = await service.getStatement(ORG_ID, statementId);

      expect(result.status).toBe(StatementExportStatus.READY);
      expect(result.lineItems).toHaveLength(1);
      expect(result.lineItems[0].eventType).toBe('deposit_credit');
      expect(result.reconciled).toBe(true);
    });

    it('throws ResourceNotFoundException when statement not found', async () => {
      statementModel.exec.mockResolvedValueOnce(null);

      await expect(service.getStatement(ORG_ID, oid())).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  // ── listStatements ──────────────────────────────────────────────────────────

  describe('listStatements', () => {
    it('returns paginated summary list without lineItems', async () => {
      const doc = makeSaveableDoc({ status: StatementExportStatus.READY });
      statementModel.exec
        .mockResolvedValueOnce([doc])  // find
        .mockResolvedValueOnce(1);     // countDocuments

      const result = await service.listStatements({
        organizationId: ORG_ID,
        page: 1,
        limit: 20,
      });

      expect(result.total).toBe(1);
      expect(result.data[0].status).toBe(StatementExportStatus.READY);
      expect((result.data[0] as Record<string, unknown>)['lineItems']).toBeUndefined();
    });
  });

  // ── expireStaleStatements ───────────────────────────────────────────────────

  describe('expireStaleStatements', () => {
    it('returns count of expired statements', async () => {
      // updateMany returns a chainable object; exec() resolves the result
      statementModel.updateMany = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 3 }),
      });

      const count = await service.expireStaleStatements();

      expect(count).toBe(3);
      expect(statementModel.updateMany).toHaveBeenCalledWith(
        {
          status: StatementExportStatus.READY,
          expiresAt: { $lt: expect.any(Date) },
        },
        {
          $set: {
            status: StatementExportStatus.EXPIRED,
            lineItems: [],
          },
        },
      );
    });
  });
});
