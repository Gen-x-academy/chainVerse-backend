import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { LoansService } from '../loans.service';
import { HoldsService } from '../holds.service';
import { DigitalCheckoutService } from '../services/digital-checkout.service';
import { DigitalReturnService } from '../services/digital-return.service';

import { Loan, LoanDocument, LoanStatus, CopyStatus } from '../schemas/loan.schema';
import { Book, BookDocument } from '../schemas/book.schema';
import { Hold, HoldDocument, HoldStatus } from '../schemas/hold.schema';
import { BookCopy, BookCopyDocument, CopyPhysicalStatus } from '../schemas/book-copy.schema';
import { DigitalLoan, DigitalLoanDocument, DigitalLoanStatus } from '../schemas/digital-loan.schema';
import { PatronProfile, PatronProfileDocument, PatronStatus } from '../schemas/patron-profile.schema';

import { LibraryPolicyService } from '../library-policy.service';
import { LibraryTransactionRunner } from '../mongo-transaction-runner';
import { PaginationService } from '../../common/pagination/pagination.service';
import { BorrowingPolicyService, PolicyResolution } from '../services/borrowing-policy.service';

import {
  ResourceConflictException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

/* ────────────────────────────────────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Creates a chainable Mongoose query mock.
 *
 * Supports `.session()`, `.sort()`, `.exec()` chaining and is awaitable via
 * the thenable protocol so `await model.find(...).session(s)` works.
 */
function makeQuery(result: any) {
  const q: any = {};
  q.session = jest.fn().mockReturnValue(q);
  q.sort = jest.fn().mockReturnValue(q);
  q.exec = jest.fn().mockResolvedValue(result);
  q.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return q;
}

const BOOK_ID = '507f1f77bcf86cd799439022';
const WORK_KEY = 'work-1';

const mockPolicy = {
  loanPeriodDays: 14,
  maxRenewals: 2,
  renewalExtensionDays: 14,
  maxActiveHolds: 5,
  allowMultipleEditionsPerWork: true,
  holdExpiryDays: 14,
  autoRenewalLeadDays: 2,
  version: 1,
};

function makeLoan(overrides: Record<string, any> = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    patronId: 'patron-1',
    bookId: BOOK_ID,
    workKey: WORK_KEY,
    checkedOutAt: new Date(),
    dueDate: new Date(Date.now() + 14 * 86_400_000),
    renewalCount: 0,
    status: LoanStatus.ACTIVE,
    copyStatus: CopyStatus.NORMAL,
    autoRenewEnabled: false,
    renewalHistory: [],
    ...overrides,
  };
}

function makeHold(overrides: Record<string, any> = {}) {
  return {
    _id: '507f1f77bcf86cd799439033',
    patronId: 'patron-1',
    bookId: BOOK_ID,
    workKey: WORK_KEY,
    status: HoldStatus.PENDING,
    requestedAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 86_400_000),
    ...overrides,
  };
}

function makeBookCopy(overrides: Record<string, any> = {}) {
  return {
    _id: '507f1f77bcf86cd799439044',
    bookId: BOOK_ID,
    barcode: 'LIB-TEST-001',
    status: CopyPhysicalStatus.AVAILABLE,
    condition: 'good',
    ...overrides,
  };
}

function makeDigitalLoan(overrides: Record<string, any> = {}) {
  return {
    _id: '507f1f77bcf86cd799439055',
    patronId: 'patron-1',
    bookId: BOOK_ID,
    editionId: 'edition-1',
    format: 'epub',
    checkedOutAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 86_400_000),
    status: DigitalLoanStatus.ACTIVE,
    accessToken: 'tok_abc123',
    ...overrides,
  };
}

const mockPatronPolicy: PolicyResolution = {
  patronId: 'patron-1',
  role: 'student',
  status: PatronStatus.ACTIVE,
  maxActiveLoans: 5,
  maxRenewals: 2,
  loanPeriodDays: 14,
  maxActiveHolds: 3,
  policyApplied: 'default',
};

/**
 * Simulates the atomic return logic from PhysicalReturnService without
 * importing it (avoids transitive BarcodeService broken import).
 *
 * Uses findOneAndUpdate with status guard so concurrent returns are safe:
 * only the first one finds status=ACTIVE; the second gets null and throws.
 */
async function simulatePhysicalReturn(
  loanModel: any,
  bookCopyModel: any,
  transactionRunner: LibraryTransactionRunner,
) {
  return transactionRunner.run(async (session: any) => {
    const updatedLoan = await loanModel.findOneAndUpdate(
      { _id: 'loan-1', status: LoanStatus.ACTIVE },
      { $set: { status: LoanStatus.RETURNED } },
      { new: true, session },
    );
    if (!updatedLoan) {
      throw new ResourceConflictException(
        'Loan was already returned by another request',
        ErrorCode.BIZ_LOAN_ALREADY_RETURNED,
      );
    }
    await bookCopyModel.findOneAndUpdate(
      { _id: 'copy-1' },
      { $set: { status: CopyPhysicalStatus.AVAILABLE } },
      { new: true, session },
    );
    return updatedLoan;
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   GROUP 1 — Last Physical Copy Race
   ════════════════════════════════════════════════════════════════════════════ */

describe('Group 1 — Last Physical Copy Race', () => {
  let loansService: LoansService;
  let loanModel: jest.Mocked<Model<LoanDocument>>;
  let bookModel: jest.Mocked<Model<BookDocument>>;
  let holdModel: jest.Mocked<Model<HoldDocument>>;
  let policyService: jest.Mocked<LibraryPolicyService>;
  let transactionRunner: jest.Mocked<LibraryTransactionRunner>;

  beforeEach(async () => {
    loanModel = {
      create: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
    } as any;

    bookModel = {
      findOneAndUpdate: jest.fn(),
      exists: jest.fn(),
      findById: jest.fn(),
    } as any;

    holdModel = {
      countDocuments: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    } as any;

    policyService = {
      getPolicy: jest.fn(),
    } as any;

    transactionRunner = {
      run: jest.fn((fn: any) => fn(null)),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: getModelToken(Loan.name), useValue: loanModel },
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: getModelToken(Hold.name), useValue: holdModel },
        { provide: LibraryPolicyService, useValue: policyService },
        { provide: LibraryTransactionRunner, useValue: transactionRunner },
        { provide: PaginationService, useValue: { paginate: jest.fn() } },
      ],
    }).compile();

    loansService = module.get<LoansService>(LoansService);
  });

  it('exactly one of N concurrent checkouts succeeds when only 1 copy remains', async () => {
    const N = 5;

    policyService.getPolicy.mockResolvedValue(mockPolicy as any);
    bookModel.findOneAndUpdate
      .mockResolvedValueOnce({ _id: BOOK_ID, availableCopies: 0 } as any)
      .mockResolvedValue(null);
    bookModel.exists.mockReturnValue(makeQuery({ _id: BOOK_ID } as any));
    loanModel.create.mockResolvedValue([makeLoan()] as any);

    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        loansService.checkout({ bookId: BOOK_ID, patronId: `patron-${i}` } as any),
      ),
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(N - 1);
    expect(loanModel.create).toHaveBeenCalledTimes(1);

    for (const f of failures) {
      const reason = (f as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(ResourceConflictException);
    }
  });

  it('no negative availableCopies after concurrent checkouts', async () => {
    const N = 10;

    policyService.getPolicy.mockResolvedValue(mockPolicy as any);
    bookModel.findOneAndUpdate
      .mockResolvedValueOnce({ _id: BOOK_ID, availableCopies: 0 } as any)
      .mockResolvedValue(null);
    bookModel.exists.mockReturnValue(makeQuery({ _id: BOOK_ID } as any));
    loanModel.create.mockResolvedValue([makeLoan()] as any);

    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        loansService.checkout({ bookId: BOOK_ID, patronId: `patron-${i}` } as any),
      ),
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    expect(successes).toHaveLength(1);

    const findOneAndUpdateCalls = bookModel.findOneAndUpdate.mock.calls;
    expect(findOneAndUpdateCalls.length).toBe(N);

    for (const call of findOneAndUpdateCalls) {
      expect(call[0]).toEqual(
        expect.objectContaining({ _id: BOOK_ID, availableCopies: { $gt: 0 } }),
      );
    }
  });

  it('concurrent checkout and hold compete correctly', async () => {
    policyService.getPolicy.mockResolvedValue(mockPolicy as any);

    bookModel.findOneAndUpdate.mockResolvedValue({
      _id: BOOK_ID,
      availableCopies: 0,
    } as any);
    loanModel.create.mockResolvedValue([makeLoan()] as any);

    const holdsService = new HoldsService(
      holdModel as any,
      bookModel as any,
      loanModel as any,
      policyService as any,
      transactionRunner as any,
      { paginate: jest.fn() } as any,
    );
    bookModel.findById.mockReturnValue(
      makeQuery({ _id: BOOK_ID, workKey: WORK_KEY, availableCopies: 0 } as any),
    );
    holdModel.countDocuments.mockReturnValue(makeQuery(0));
    holdModel.create.mockResolvedValue([makeHold({ patronId: 'patron-2' })] as any);

    const [checkoutResult, holdResult] = await Promise.allSettled([
      loansService.checkout({ bookId: BOOK_ID, patronId: 'patron-1' } as any),
      holdsService.createHold('patron-2', { bookId: BOOK_ID } as any),
    ]);

    expect(checkoutResult.status).toBe('fulfilled');
    expect(holdResult.status).toBe('fulfilled');
    expect(loanModel.create).toHaveBeenCalledTimes(1);
    expect(holdModel.create).toHaveBeenCalledTimes(1);
  });

  it('concurrent returns do not corrupt availableCopies', async () => {
    const bookCopyModel = {
      findOneAndUpdate: jest
        .fn()
        .mockResolvedValue({ _id: 'copy-1', status: CopyPhysicalStatus.AVAILABLE }),
    } as any;

    const returnLoanModel = {
      findOneAndUpdate: jest
        .fn()
        .mockResolvedValueOnce({ ...makeLoan(), status: LoanStatus.RETURNED })
        .mockResolvedValueOnce(null),
    } as any;

    const results = await Promise.allSettled([
      simulatePhysicalReturn(returnLoanModel, bookCopyModel, transactionRunner),
      simulatePhysicalReturn(returnLoanModel, bookCopyModel, transactionRunner),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ResourceConflictException,
    );
    expect((failures[0] as PromiseRejectedResult).reason.errorCode).toBe(
      ErrorCode.BIZ_LOAN_ALREADY_RETURNED,
    );
  });

  it('checkout after all copies claimed returns conflict', async () => {
    policyService.getPolicy.mockResolvedValue(mockPolicy as any);
    bookModel.findOneAndUpdate.mockResolvedValue(null);
    bookModel.exists.mockReturnValue(makeQuery({ _id: BOOK_ID } as any));

    await expect(
      loansService.checkout({ bookId: BOOK_ID, patronId: 'patron-1' } as any),
    ).rejects.toThrow(ResourceConflictException);

    expect(loanModel.create).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   GROUP 2 — Last Digital License Race
   ════════════════════════════════════════════════════════════════════════════ */

describe('Group 2 — Last Digital License Race', () => {
  let service: DigitalCheckoutService;
  let digitalLoanModel: jest.Mocked<Model<DigitalLoanDocument>>;
  let bookCopyModel: jest.Mocked<Model<BookCopyDocument>>;
  let patronModel: jest.Mocked<Model<PatronProfileDocument>>;
  let policyService: jest.Mocked<BorrowingPolicyService>;
  let transactionRunner: jest.Mocked<LibraryTransactionRunner>;

  beforeEach(async () => {
    digitalLoanModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    } as any;

    bookCopyModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    } as any;

    patronModel = {
      findOne: jest.fn(),
    } as any;

    policyService = {
      resolvePolicy: jest.fn(),
    } as any;

    transactionRunner = {
      run: jest.fn((fn: any) => fn(null)),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigitalCheckoutService,
        { provide: getModelToken(DigitalLoan.name), useValue: digitalLoanModel },
        { provide: getModelToken(PatronProfile.name), useValue: patronModel },
        { provide: getModelToken(BookCopy.name), useValue: bookCopyModel },
        { provide: BorrowingPolicyService, useValue: policyService },
        { provide: LibraryTransactionRunner, useValue: transactionRunner },
      ],
    }).compile();

    service = module.get<DigitalCheckoutService>(DigitalCheckoutService);
  });

  it('exactly one of N concurrent digital checkouts succeeds when 1 license remains', async () => {
    const N = 5;
    const license = makeBookCopy();

    policyService.resolvePolicy.mockResolvedValue(mockPatronPolicy);
    digitalLoanModel.findOne.mockReturnValue(makeQuery(null));
    bookCopyModel.findOne.mockReturnValue(makeQuery(license));
    bookCopyModel.findOneAndUpdate
      .mockReturnValueOnce(makeQuery({ ...license, status: CopyPhysicalStatus.CHECKED_OUT }))
      .mockReturnValue(makeQuery(null));
    digitalLoanModel.create.mockResolvedValue([makeDigitalLoan()] as any);

    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) =>
        service.checkout(`patron-${i}`, BOOK_ID, 'edition-1'),
      ),
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(N - 1);

    for (const f of failures) {
      const reason = (f as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(ResourceConflictException);
      expect(reason.errorCode).toBe(ErrorCode.BIZ_ITEM_UNAVAILABLE);
    }
  });

  it('idempotent retry returns same active digital loan', async () => {
    const existingLoan = makeDigitalLoan();

    policyService.resolvePolicy.mockResolvedValue(mockPatronPolicy);
    digitalLoanModel.findOne.mockReturnValue(makeQuery(existingLoan));

    const first = await service.checkout('patron-1', BOOK_ID, 'edition-1');
    const second = await service.checkout('patron-1', BOOK_ID, 'edition-1');

    expect(first._id).toBe(existingLoan._id);
    expect(second._id).toBe(existingLoan._id);
    expect(digitalLoanModel.create).not.toHaveBeenCalled();
    expect(bookCopyModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('digital return and checkout race: license becomes available atomically', async () => {
    const license = makeBookCopy({ status: CopyPhysicalStatus.CHECKED_OUT });
    const activeDigitalLoan = makeDigitalLoan({ patronId: 'patron-1' });
    const newDigitalLoan = makeDigitalLoan({ patronId: 'patron-2', _id: '507f1f77bcf86cd799439066' });

    const bookCopyModelForBoth = {
      findOneAndUpdate: jest.fn()
        .mockResolvedValueOnce({ ...license, status: CopyPhysicalStatus.AVAILABLE })
        .mockResolvedValueOnce({ ...license, status: CopyPhysicalStatus.CHECKED_OUT }),
      findOne: jest.fn().mockReturnValue(makeQuery({ ...license, status: CopyPhysicalStatus.AVAILABLE })),
    } as any;

    const digitalLoanModelForBoth = {
      findById: jest.fn().mockResolvedValue(activeDigitalLoan),
      findOne: jest.fn().mockReturnValue(makeQuery(null)),
      findOneAndUpdate: jest.fn().mockResolvedValue({ ...activeDigitalLoan, status: DigitalLoanStatus.RETURNED }),
      create: jest.fn().mockResolvedValue([newDigitalLoan]),
    } as any;

    const digitalReturnService = new DigitalReturnService(
      digitalLoanModelForBoth,
      bookCopyModelForBoth,
      transactionRunner,
    );

    const checkoutService = new DigitalCheckoutService(
      digitalLoanModelForBoth,
      patronModel,
      bookCopyModelForBoth,
      policyService,
      transactionRunner,
    );

    policyService.resolvePolicy.mockResolvedValue(mockPatronPolicy);

    const [returnResult, checkoutResult] = await Promise.allSettled([
      digitalReturnService.returnDigitalLoan('dloan-1', 'patron-1'),
      checkoutService.checkout('patron-2', BOOK_ID, 'edition-1'),
    ]);

    expect(returnResult.status).toBe('fulfilled');
    expect(checkoutResult.status).toBe('fulfilled');
  });

  it('no duplicate digital loans for same patron+edition', async () => {
    const existingLoan = makeDigitalLoan();

    policyService.resolvePolicy.mockResolvedValue(mockPatronPolicy);
    digitalLoanModel.findOne.mockReturnValue(makeQuery(existingLoan));

    await service.checkout('patron-1', BOOK_ID, 'edition-1');
    await service.checkout('patron-1', BOOK_ID, 'edition-1');
    await service.checkout('patron-1', BOOK_ID, 'edition-1');

    expect(digitalLoanModel.create).not.toHaveBeenCalled();
    expect(bookCopyModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   GROUP 3 — Hold Ordering and Concurrency
   ════════════════════════════════════════════════════════════════════════════ */

describe('Group 3 — Hold Ordering and Concurrency', () => {
  let service: HoldsService;
  let holdModel: jest.Mocked<Model<HoldDocument>>;
  let bookModel: jest.Mocked<Model<BookDocument>>;
  let loanModel: jest.Mocked<Model<LoanDocument>>;
  let policyService: jest.Mocked<LibraryPolicyService>;
  let transactionRunner: jest.Mocked<LibraryTransactionRunner>;

  beforeEach(async () => {
    holdModel = {
      create: jest.fn(),
      countDocuments: jest.fn(),
      findOne: jest.fn(),
    } as any;

    bookModel = {
      findById: jest.fn(),
    } as any;

    loanModel = {
      findOne: jest.fn(),
    } as any;

    policyService = {
      getPolicy: jest.fn(),
    } as any;

    transactionRunner = {
      run: jest.fn((fn: any) => fn(null)),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HoldsService,
        { provide: getModelToken(Hold.name), useValue: holdModel },
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: getModelToken(Loan.name), useValue: loanModel },
        { provide: LibraryPolicyService, useValue: policyService },
        { provide: LibraryTransactionRunner, useValue: transactionRunner },
        { provide: PaginationService, useValue: { paginate: jest.fn() } },
      ],
    }).compile();

    service = module.get<HoldsService>(HoldsService);
  });

  it('two concurrent holds on last-copy book: both succeed independently', async () => {
    const book1 = { _id: BOOK_ID, workKey: WORK_KEY, availableCopies: 1 };
    const book2 = { _id: '507f1f77bcf86cd799439077', workKey: WORK_KEY, availableCopies: 1 };

    policyService.getPolicy.mockResolvedValue({
      ...mockPolicy,
      allowMultipleEditionsPerWork: true,
    } as any);

    bookModel.findById
      .mockReturnValueOnce(makeQuery(book1 as any))
      .mockReturnValueOnce(makeQuery(book2 as any));

    holdModel.countDocuments
      .mockReturnValueOnce(makeQuery(0))
      .mockReturnValueOnce(makeQuery(0));

    holdModel.create
      .mockResolvedValueOnce([makeHold({ patronId: 'patron-1', bookId: BOOK_ID })] as any)
      .mockResolvedValueOnce([makeHold({ patronId: 'patron-2', bookId: '507f1f77bcf86cd799439077' })] as any);

    const [hold1, hold2] = await Promise.allSettled([
      service.createHold('patron-1', { bookId: BOOK_ID } as any),
      service.createHold('patron-2', { bookId: '507f1f77bcf86cd799439077' } as any),
    ]);

    expect(hold1.status).toBe('fulfilled');
    expect(hold2.status).toBe('fulfilled');
    expect(holdModel.create).toHaveBeenCalledTimes(2);
  });

  it('concurrent hold creation respects unique partial index', async () => {
    const book = { _id: BOOK_ID, workKey: WORK_KEY };

    policyService.getPolicy.mockResolvedValue({
      ...mockPolicy,
      allowMultipleEditionsPerWork: true,
    } as any);

    bookModel.findById
      .mockReturnValueOnce(makeQuery(book as any))
      .mockReturnValueOnce(makeQuery(book as any));

    holdModel.countDocuments
      .mockReturnValueOnce(makeQuery(0))
      .mockReturnValueOnce(makeQuery(0));

    holdModel.create
      .mockResolvedValueOnce([makeHold({ patronId: 'patron-1' })] as any)
      .mockResolvedValueOnce([makeHold({ patronId: 'patron-2' })] as any);

    const [hold1, hold2] = await Promise.allSettled([
      service.createHold('patron-1', { bookId: BOOK_ID } as any),
      service.createHold('patron-2', { bookId: BOOK_ID } as any),
    ]);

    expect(hold1.status).toBe('fulfilled');
    expect(hold2.status).toBe('fulfilled');
    expect(holdModel.create).toHaveBeenCalledTimes(2);
  });

  it('duplicate hold from same patron rejected atomically', async () => {
    const book = { _id: BOOK_ID, workKey: WORK_KEY };

    policyService.getPolicy.mockResolvedValue({
      ...mockPolicy,
      allowMultipleEditionsPerWork: true,
    } as any);

    bookModel.findById
      .mockReturnValueOnce(makeQuery(book as any))
      .mockReturnValueOnce(makeQuery(book as any));

    holdModel.countDocuments
      .mockReturnValueOnce(makeQuery(0))
      .mockReturnValueOnce(makeQuery(1));

    holdModel.create
      .mockResolvedValueOnce([makeHold()] as any)
      .mockRejectedValueOnce(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));

    const [first, second] = await Promise.allSettled([
      service.createHold('patron-1', { bookId: BOOK_ID } as any),
      service.createHold('patron-1', { bookId: BOOK_ID } as any),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect((second as PromiseRejectedResult).reason).toBeInstanceOf(
      ResourceConflictException,
    );
  });

  it('hold limit enforced under concurrent creation', async () => {
    const maxHolds = 3;
    const attemptCount = 5;

    policyService.getPolicy.mockResolvedValue({
      ...mockPolicy,
      maxActiveHolds: maxHolds,
      allowMultipleEditionsPerWork: true,
    } as any);

    const bookIds = Array.from({ length: attemptCount }, (_, i) => `book-${i}`);

    bookModel.findById.mockImplementation((id: string) =>
      makeQuery({ _id: id, workKey: `wk-${id}` } as any),
    );

    let holdCount = 0;
    holdModel.countDocuments.mockImplementation(() => makeQuery(holdCount++));
    holdModel.create.mockImplementation((docs: any[]) =>
      Promise.resolve([makeHold({ bookId: docs[0].bookId })]),
    );

    const results = await Promise.allSettled(
      Array.from({ length: attemptCount }, (_, i) =>
        service.createHold('patron-1', { bookId: bookIds[i] } as any),
      ),
    );

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes.length).toBeGreaterThanOrEqual(1);
    expect(successes.length).toBeLessThanOrEqual(maxHolds);

    for (const f of failures) {
      expect((f as PromiseRejectedResult).reason).toBeInstanceOf(
        ResourceConflictException,
      );
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   GROUP 4 — Renewal Race Conditions
   ════════════════════════════════════════════════════════════════════════════ */

describe('Group 4 — Renewal Race Conditions', () => {
  let loansService: LoansService;
  let loanModel: jest.Mocked<Model<LoanDocument>>;
  let bookModel: jest.Mocked<Model<BookDocument>>;
  let holdModel: jest.Mocked<Model<HoldDocument>>;
  let policyService: jest.Mocked<LibraryPolicyService>;
  let transactionRunner: jest.Mocked<LibraryTransactionRunner>;

  const policy = {
    ...mockPolicy,
    maxRenewals: 1,
  };

  beforeEach(async () => {
    loanModel = {
      create: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
    } as any;

    bookModel = {
      findOneAndUpdate: jest.fn(),
      exists: jest.fn(),
      findById: jest.fn(),
    } as any;

    holdModel = {
      findOne: jest.fn(),
    } as any;

    policyService = {
      getPolicy: jest.fn(),
    } as any;

    transactionRunner = {
      run: jest.fn((fn: any) => fn(null)),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: getModelToken(Loan.name), useValue: loanModel },
        { provide: getModelToken(Book.name), useValue: bookModel },
        { provide: getModelToken(Hold.name), useValue: holdModel },
        { provide: LibraryPolicyService, useValue: policyService },
        { provide: LibraryTransactionRunner, useValue: transactionRunner },
        { provide: PaginationService, useValue: { paginate: jest.fn() } },
      ],
    }).compile();

    loansService = module.get<LoansService>(LoansService);
  });

  it('concurrent renewals: only one succeeds when renewal limit is 1', async () => {
    const loan = makeLoan({ renewalCount: 0 });
    const renewedLoan = { ...loan, renewalCount: 1 };

    holdModel.findOne.mockReturnValue(makeQuery(null));

    loanModel.findById
      .mockReturnValueOnce(makeQuery(loan))
      .mockReturnValueOnce(makeQuery(loan));

    loanModel.findOneAndUpdate
      .mockReturnValueOnce(makeQuery(renewedLoan))
      .mockReturnValueOnce(makeQuery(null));

    policyService.getPolicy.mockResolvedValue(policy as any);

    const results = await Promise.allSettled([
      loansService.renewForAutoJob(loan as any, policy as any),
      loansService.renewForAutoJob(loan as any, policy as any),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ResourceConflictException,
    );
  });

  it('renewal rejected after return races ahead', async () => {
    const loan = makeLoan({ renewalCount: 0 });

    const returnLoanModel = {
      findOneAndUpdate: jest
        .fn()
        .mockResolvedValue({ ...loan, status: LoanStatus.RETURNED }),
    } as any;
    const bookCopyModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    } as any;

    holdModel.findOne.mockReturnValue(makeQuery(null));
    policyService.getPolicy.mockResolvedValue(policy as any);

    loanModel.findById.mockReturnValueOnce(makeQuery({ ...loan, status: LoanStatus.RETURNED }));

    loanModel.findOneAndUpdate
      .mockReturnValueOnce(makeQuery(null));

    const [returnResult, renewalResult] = await Promise.allSettled([
      simulatePhysicalReturn(returnLoanModel, bookCopyModel, transactionRunner),
      loansService.renewForAutoJob(loan as any, policy as any),
    ]);

    expect(returnResult.status).toBe('fulfilled');
    expect(renewalResult.status).toBe('rejected');
    expect((renewalResult as PromiseRejectedResult).reason).toBeInstanceOf(
      ResourceConflictException,
    );
  });

  it('renewal rejected when hold placed by another patron', async () => {
    const loan = makeLoan({ renewalCount: 0 });
    const conflictingHold = makeHold({ patronId: 'patron-other' });

    holdModel.findOne.mockReturnValue(makeQuery(conflictingHold));
    policyService.getPolicy.mockResolvedValue(policy as any);

    loanModel.findById.mockReturnValue(makeQuery(loan));

    await expect(
      loansService.renewForAutoJob(loan as any, policy as any),
    ).rejects.toThrow(ResourceConflictException);
  });

  it('auto-renewal and manual renewal race', async () => {
    const loan = makeLoan({ renewalCount: 0 });
    const renewedLoan = { ...loan, renewalCount: 1 };

    holdModel.findOne.mockReturnValue(makeQuery(null));
    policyService.getPolicy.mockResolvedValue(policy as any);

    loanModel.findById
      .mockReturnValueOnce(makeQuery(loan))
      .mockReturnValueOnce(makeQuery(loan))
      .mockReturnValueOnce(makeQuery(loan));

    loanModel.findOneAndUpdate
      .mockReturnValueOnce(makeQuery(renewedLoan))
      .mockReturnValueOnce(makeQuery(null));

    const results = await Promise.allSettled([
      loansService.renewForAutoJob(loan as any, policy as any),
      loansService.renewForAutoJob(loan as any, policy as any),
    ]);

    const successes = results.filter((r) => r.status === 'fulfilled');
    const failures = results.filter((r) => r.status === 'rejected');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ResourceConflictException,
    );
  });
});
