import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LibraryChargePaymentService } from '../services/library-charge-payment.service';
import {
  LibraryChargePayment,
  LibraryChargePaymentDocument,
} from '../schemas/library-charge-payment.schema';
import { LedgerService } from '../services/ledger.service';
import { StellarService } from '../../stellar/stellar.service';
import { LedgerEntryType } from '../enums/ledger-entry-type.enum';
import { PayLibraryChargeDto } from '../dto/pay-library-charge.dto';
import {
  BusinessRuleException,
  ResourceConflictException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

describe('LibraryChargePaymentService', () => {
  let service: LibraryChargePaymentService;
  let paymentModel: jest.Mocked<Model<LibraryChargePaymentDocument>>;
  let ledgerService: jest.Mocked<LedgerService>;
  let stellarService: jest.Mocked<StellarService>;

  const PATRON_ID = 'patron-abc';
  const CHARGE_ID = '507f1f77bcf86cd799439011';
  const TX_HASH =
    'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
  const DESTINATION = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

  const mockChargeEntry = {
    _id: CHARGE_ID,
    patronId: PATRON_ID,
    loanId: 'loan-1',
    entryType: LedgerEntryType.OVERDUE_FINE,
    amountMinorUnits: 500,
    currency: 'USD',
    reason: 'Overdue fine',
    referenceEntryId: null,
    createdBy: 'system',
    metadata: {},
  };

  const mockPaymentDoc = {
    _id: '507f1f77bcf86cd799439099',
    patronId: PATRON_ID,
    chargeEntryId: CHARGE_ID,
    asset: 'XLM',
    amountMinorUnits: 500,
    currency: 'USD',
    destination: DESTINATION,
    memo: null,
    transactionHash: TX_HASH,
    verified: true,
    ledgerEntryId: '507f1f77bcf86cd799439022',
    submittedBy: PATRON_ID,
  };

  const dto: PayLibraryChargeDto = {
    chargeEntryId: CHARGE_ID,
    asset: 'XLM',
    amountMinorUnits: 500,
    currency: 'USD',
    destination: DESTINATION,
    transactionHash: TX_HASH,
  };

  beforeEach(async () => {
    const mockFind = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    });

    paymentModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      find: mockFind,
      create: jest.fn().mockResolvedValue(mockPaymentDoc),
      findById: jest.fn().mockReturnValue({ exec: jest.fn() }),
    } as any;

    ledgerService = {
      getEntry: jest.fn().mockResolvedValue(mockChargeEntry),
      postEntry: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439022',
        toString: () => '507f1f77bcf86cd799439022',
      }),
    } as any;

    stellarService = {
      verifyPayment: jest.fn().mockResolvedValue({
        verified: true,
        transactionId: TX_HASH,
        timestamp: new Date().toISOString(),
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryChargePaymentService,
        {
          provide: getModelToken(LibraryChargePayment.name),
          useValue: paymentModel,
        },
        { provide: LedgerService, useValue: ledgerService },
        { provide: StellarService, useValue: stellarService },
      ],
    }).compile();

    service = module.get<LibraryChargePaymentService>(
      LibraryChargePaymentService,
    );
  });

  describe('payCharge', () => {
    it('should verify and post a PAYMENT ledger entry for a valid charge', async () => {
      const result = await service.payCharge(dto, PATRON_ID);

      expect(stellarService.verifyPayment).toHaveBeenCalledWith({
        transactionHash: TX_HASH,
        expectedAmount: '500',
        expectedDestination: DESTINATION,
      });

      expect(ledgerService.postEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          patronId: PATRON_ID,
          entryType: LedgerEntryType.PAYMENT,
          amountMinorUnits: -500,
          currency: 'USD',
          referenceEntryId: CHARGE_ID,
        }),
      );

      expect(result.verified).toBe(true);
      expect(result.payment).toBeDefined();
    });

    it('should return existing record idempotently when same hash+charge already exists', async () => {
      paymentModel.findOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPaymentDoc),
      });

      const result = await service.payCharge(dto, PATRON_ID);

      expect(stellarService.verifyPayment).not.toHaveBeenCalled();
      expect(ledgerService.postEntry).not.toHaveBeenCalled();
      expect(result.payment).toEqual(mockPaymentDoc);
    });

    it('should reject a non-chargeable ledger entry type', async () => {
      ledgerService.getEntry = jest.fn().mockResolvedValue({
        ...mockChargeEntry,
        entryType: LedgerEntryType.PAYMENT,
      });

      await expect(service.payCharge(dto, PATRON_ID)).rejects.toBeInstanceOf(
        BusinessRuleException,
      );
    });

    it('should reject when currency mismatches the charge entry', async () => {
      const mismatchDto = { ...dto, currency: 'EUR' };

      await expect(
        service.payCharge(mismatchDto, PATRON_ID),
      ).rejects.toBeInstanceOf(ValidationDomainException);
    });

    it('should reject when payment amount exceeds the charge amount', async () => {
      const overDto = { ...dto, amountMinorUnits: 9999 };

      await expect(
        service.payCharge(overDto, PATRON_ID),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });

    it('should reject when the same transaction hash was already applied to a different charge', async () => {
      // First call (chargeEntryId match) returns null; second call (hash conflict) returns a doc
      paymentModel.findOne = jest
        .fn()
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
        .mockReturnValueOnce({
          exec: jest
            .fn()
            .mockResolvedValue({ ...mockPaymentDoc, chargeEntryId: 'OTHER' }),
        });

      await expect(service.payCharge(dto, PATRON_ID)).rejects.toBeInstanceOf(
        ResourceConflictException,
      );
    });

    it('should persist an unverified payment record when Stellar rejects the transaction', async () => {
      stellarService.verifyPayment = jest.fn().mockResolvedValue({
        verified: false,
        transactionId: TX_HASH,
        timestamp: new Date().toISOString(),
      });

      const result = await service.payCharge(dto, PATRON_ID);

      expect(ledgerService.postEntry).not.toHaveBeenCalled();
      expect(result.verified).toBe(false);
    });
  });

  describe('listForPatron', () => {
    it('should return payment records sorted newest-first', async () => {
      const mockSort = jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([mockPaymentDoc]) }),
      });
      paymentModel.find = jest.fn().mockReturnValue({ sort: mockSort });

      const result = await service.listForPatron(PATRON_ID);

      expect(paymentModel.find).toHaveBeenCalledWith({ patronId: PATRON_ID });
      expect(result).toEqual([mockPaymentDoc]);
    });
  });

  describe('getById', () => {
    it('should return a payment document by ID', async () => {
      paymentModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockPaymentDoc),
      });

      const result = await service.getById('507f1f77bcf86cd799439099');
      expect(result).toEqual(mockPaymentDoc);
    });

    it('should throw ResourceNotFoundException when document is missing', async () => {
      paymentModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getById('507f1f77bcf86cd799439099'),
      ).rejects.toThrow();
    });
  });
});
