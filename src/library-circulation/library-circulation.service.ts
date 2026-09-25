import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  ResourceNotFoundException,
  ResourceConflictException,
  BusinessRuleException,
  ForbiddenDomainException,
  ValidationDomainException,
} from '../common/errors/domain.exception';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { Role } from '../common/enums/role.enum';
import { DomainEvents } from '../events/event-names';
import { LibraryItem, LibraryItemDocument } from './schemas/library-item.schema';
import { Loan, LoanDocument, LoanStatus } from './schemas/loan.schema';
import { Hold, HoldDocument, HoldStatus } from './schemas/hold.schema';
import {
  CirculationReceipt,
  CirculationReceiptDocument,
  ReceiptType,
} from './schemas/circulation-receipt.schema';
import {
  DueDateOverride,
  DueDateOverrideDocument,
  DueDateOverrideStatus,
} from './schemas/due-date-override.schema';
import { PatronLookupAudit, PatronLookupAuditDocument } from './schemas/patron-lookup-audit.schema';
import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { PlaceHoldDto } from './dto/place-hold.dto';
import { DueDateOverrideDto } from './dto/due-date-override.dto';
import { ResolveOverrideDto } from './dto/resolve-override.dto';
import { PatronLoanQueryDto } from './dto/patron-loan-query.dto';
import {
  DEFAULT_LOAN_PERIOD_DAYS,
  DEFAULT_MAX_RENEWALS,
  DEFAULT_POLICY_LABEL,
  MAX_STAFF_OVERRIDE_EXTENSION_DAYS,
} from './library-circulation.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReceiptResponse {
  transactionId: string;
  type: ReceiptType;
  itemTitle: string;
  itemAuthor: string;
  dueAt: Date | null;
  returnedAt: Date | null;
  policy: string;
  servicePoint: string;
  issuedAt: Date;
}

export interface LoanSummary {
  loanId: string;
  itemTitle: string;
  itemAuthor: string;
  status: LoanStatus;
  checkedOutAt: Date;
  dueAt: Date;
  returnedAt: Date | null;
  renewalCount: number;
  servicePoint: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class LibraryCirculationService {
  constructor(
    @InjectModel(LibraryItem.name) private readonly itemModel: Model<LibraryItemDocument>,
    @InjectModel(Loan.name) private readonly loanModel: Model<LoanDocument>,
    @InjectModel(Hold.name) private readonly holdModel: Model<HoldDocument>,
    @InjectModel(CirculationReceipt.name)
    private readonly receiptModel: Model<CirculationReceiptDocument>,
    @InjectModel(DueDateOverride.name)
    private readonly overrideModel: Model<DueDateOverrideDocument>,
    @InjectModel(PatronLookupAudit.name)
    private readonly lookupAuditModel: Model<PatronLookupAuditDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Catalog (minimal support for the circulation flows below) ───────────

  async createItem(dto: CreateLibraryItemDto): Promise<LibraryItemDocument> {
    const existing = await this.itemModel.findOne({ barcode: dto.barcode }).lean();
    if (existing) {
      throw new ResourceConflictException(
        `An item with barcode "${dto.barcode}" already exists`,
      );
    }

    return this.itemModel.create({
      title: dto.title,
      author: dto.author,
      barcode: dto.barcode,
      totalCopies: dto.totalCopies,
      availableCopies: dto.totalCopies,
      servicePoint: dto.servicePoint ?? 'main',
    });
  }

  // ── Checkout / return / renew ────────────────────────────────────────────

  async checkout(
    actorId: string,
    actorRole: Role,
    dto: CheckoutDto,
  ): Promise<ReceiptResponse> {
    const patronId = this.resolvePatronId(actorId, actorRole, dto.patronId);

    const item = await this.itemModel.findOneAndUpdate(
      { barcode: dto.barcode, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } },
      { new: true },
    );

    if (!item) {
      const exists = await this.itemModel.exists({ barcode: dto.barcode });
      if (!exists) {
        throw new ResourceNotFoundException(
          `No library item found with barcode "${dto.barcode}"`,
          ErrorCode.RES_LIBRARY_ITEM_NOT_FOUND,
        );
      }
      throw new BusinessRuleException(
        `No available copies of "${dto.barcode}" to check out`,
        ErrorCode.BIZ_ITEM_UNAVAILABLE,
      );
    }

    const checkedOutAt = new Date();
    const dueAt = new Date(checkedOutAt.getTime() + DEFAULT_LOAN_PERIOD_DAYS * DAY_MS);

    const loan = await this.loanModel.create({
      itemId: item._id,
      patronId,
      status: LoanStatus.ACTIVE,
      checkedOutAt,
      dueAt,
      renewalCount: 0,
      maxRenewals: DEFAULT_MAX_RENEWALS,
      servicePoint: item.servicePoint,
      checkedOutByStaffId: actorRole === Role.STUDENT ? null : actorId,
    });

    const receipt = await this.receiptModel.create({
      transactionId: this.generateTransactionId(),
      type: ReceiptType.CHECKOUT,
      loanId: loan._id,
      patronId,
      itemTitle: item.title,
      itemAuthor: item.author,
      dueAt,
      policy: DEFAULT_POLICY_LABEL,
      servicePoint: item.servicePoint,
    });

    this.eventEmitter.emit(DomainEvents.LIBRARY_CHECKOUT_RECEIPT_CREATED, {
      patronId,
      transactionId: receipt.transactionId,
      itemTitle: item.title,
      dueAt,
    });

    return this.toReceiptResponse(receipt);
  }

  async returnLoan(
    actorId: string,
    actorRole: Role,
    loanId: string,
  ): Promise<ReceiptResponse> {
    const loan = await this.loanModel.findById(loanId);
    if (!loan) {
      throw new ResourceNotFoundException('Loan not found', ErrorCode.RES_LOAN_NOT_FOUND);
    }
    this.assertLoanAccess(actorId, actorRole, loan);

    if (loan.status !== LoanStatus.ACTIVE) {
      throw new BusinessRuleException(
        'This loan has already been returned',
        ErrorCode.BIZ_LOAN_ALREADY_RETURNED,
      );
    }

    const item = await this.itemModel.findById(loan.itemId);
    if (!item) {
      throw new ResourceNotFoundException(
        'The item for this loan no longer exists',
        ErrorCode.RES_LIBRARY_ITEM_NOT_FOUND,
      );
    }

    const returnedAt = new Date();
    loan.status = LoanStatus.RETURNED;
    loan.returnedAt = returnedAt;
    loan.returnedByStaffId = actorRole === Role.STUDENT ? null : actorId;
    await loan.save();

    item.availableCopies = Math.min(item.availableCopies + 1, item.totalCopies);
    await item.save();

    const receipt = await this.receiptModel.create({
      transactionId: this.generateTransactionId(),
      type: ReceiptType.RETURN,
      loanId: loan._id,
      patronId: loan.patronId,
      itemTitle: item.title,
      itemAuthor: item.author,
      returnedAt,
      policy: DEFAULT_POLICY_LABEL,
      servicePoint: item.servicePoint,
    });

    this.eventEmitter.emit(DomainEvents.LIBRARY_RETURN_RECEIPT_CREATED, {
      patronId: loan.patronId,
      transactionId: receipt.transactionId,
      itemTitle: item.title,
      returnedAt,
    });

    return this.toReceiptResponse(receipt);
  }

  async renewLoan(actorId: string, actorRole: Role, loanId: string): Promise<LoanSummary> {
    const loan = await this.loanModel.findById(loanId);
    if (!loan) {
      throw new ResourceNotFoundException('Loan not found', ErrorCode.RES_LOAN_NOT_FOUND);
    }
    this.assertLoanAccess(actorId, actorRole, loan);

    if (loan.status !== LoanStatus.ACTIVE) {
      throw new BusinessRuleException(
        'This loan has already been returned',
        ErrorCode.BIZ_LOAN_ALREADY_RETURNED,
      );
    }

    if (loan.renewalCount >= loan.maxRenewals) {
      throw new BusinessRuleException(
        'This loan has reached its renewal limit',
        ErrorCode.BIZ_RENEWAL_LIMIT_EXCEEDED,
      );
    }

    if (await this.hasActiveHoldConflict(loan.itemId, loan.patronId)) {
      throw new BusinessRuleException(
        'This item cannot be renewed because another patron is waiting for it',
        ErrorCode.BIZ_ITEM_UNAVAILABLE,
      );
    }

    loan.dueAt = new Date(loan.dueAt.getTime() + DEFAULT_LOAN_PERIOD_DAYS * DAY_MS);
    loan.renewalCount += 1;
    await loan.save();

    const item = await this.itemModel.findById(loan.itemId).lean();

    return this.toLoanSummary(loan, item);
  }

  async getMyLoans(patronId: string, query: PatronLoanQueryDto): Promise<PaginatedResult<LoanSummary>> {
    return this.listLoansForPatron(patronId, query);
  }

  // ── Holds (minimal support for override hold-conflict detection) ────────

  async placeHold(patronId: string, dto: PlaceHoldDto): Promise<{ holdId: string; itemTitle: string }> {
    const item = await this.itemModel.findOne({ barcode: dto.barcode });
    if (!item) {
      throw new ResourceNotFoundException(
        `No library item found with barcode "${dto.barcode}"`,
        ErrorCode.RES_LIBRARY_ITEM_NOT_FOUND,
      );
    }

    const hold = await this.holdModel.create({
      itemId: item._id,
      patronId,
      status: HoldStatus.ACTIVE,
    });

    return { holdId: String(hold._id), itemTitle: item.title };
  }

  private async hasActiveHoldConflict(itemId: string, excludePatronId: string): Promise<boolean> {
    const conflict = await this.holdModel.exists({
      itemId,
      patronId: { $ne: excludePatronId },
      status: HoldStatus.ACTIVE,
    });
    return Boolean(conflict);
  }

  // ── Librarian patron-loan lookup (#1021) ─────────────────────────────────

  async lookupPatronLoans(
    staffId: string,
    patronId: string,
    query: PatronLoanQueryDto,
    requestId: string | undefined,
  ): Promise<PaginatedResult<LoanSummary>> {
    const result = await this.listLoansForPatron(patronId, query);

    await this.lookupAuditModel.create({
      staffId,
      patronId,
      resultCount: result.data.length,
      requestId: requestId ?? null,
    });

    return result;
  }

  private async listLoansForPatron(
    patronId: string,
    query: PatronLoanQueryDto,
  ): Promise<PaginatedResult<LoanSummary>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { patronId };
    if (query.status) filter.status = query.status;

    const [loans, total] = await Promise.all([
      this.loanModel
        .find(filter)
        .sort({ checkedOutAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('itemId')
        .lean(),
      this.loanModel.countDocuments(filter),
    ]);

    const data = loans.map((loan: any) =>
      this.toLoanSummary(loan, loan.itemId && typeof loan.itemId === 'object' ? loan.itemId : null),
    );

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  // ── Manual due-date override with approval audit (#1024) ────────────────

  async requestDueDateOverride(
    staffId: string,
    loanId: string,
    dto: DueDateOverrideDto,
  ): Promise<DueDateOverrideDocument> {
    const loan = await this.loanModel.findById(loanId);
    if (!loan) {
      throw new ResourceNotFoundException('Loan not found', ErrorCode.RES_LOAN_NOT_FOUND);
    }
    if (loan.status !== LoanStatus.ACTIVE) {
      throw new BusinessRuleException(
        'Cannot override the due date of a loan that is not active',
        ErrorCode.BIZ_LOAN_ALREADY_RETURNED,
      );
    }

    const newDueAt = new Date(dto.newDueAt);
    const previousDueAt = loan.dueAt;

    if (newDueAt.getTime() === previousDueAt.getTime()) {
      throw new ValidationDomainException('New due date must differ from the current due date');
    }

    const isExtension = newDueAt.getTime() > previousDueAt.getTime();
    const extensionDays = (newDueAt.getTime() - previousDueAt.getTime()) / DAY_MS;
    const exceedsStaffLimit = isExtension && extensionDays > MAX_STAFF_OVERRIDE_EXTENSION_DAYS;
    const hasHoldConflict = isExtension && (await this.hasActiveHoldConflict(loan.itemId, loan.patronId));
    const requiresApproval = exceedsStaffLimit || hasHoldConflict;

    const override = await this.overrideModel.create({
      loanId: loan._id,
      previousDueAt,
      newDueAt,
      reason: dto.reason,
      requestedByStaffId: staffId,
      status: requiresApproval
        ? DueDateOverrideStatus.PENDING_APPROVAL
        : DueDateOverrideStatus.APPLIED,
      exceedsStaffLimit,
      hasHoldConflict,
    });

    if (!requiresApproval) {
      loan.dueAt = newDueAt;
      await loan.save();
    }

    return override;
  }

  async resolveDueDateOverride(
    adminId: string,
    overrideId: string,
    dto: ResolveOverrideDto,
  ): Promise<DueDateOverrideDocument> {
    const override = await this.overrideModel.findById(overrideId);
    if (!override) {
      throw new ResourceNotFoundException(
        'Due-date override not found',
        ErrorCode.RES_OVERRIDE_NOT_FOUND,
      );
    }
    if (override.status !== DueDateOverrideStatus.PENDING_APPROVAL) {
      throw new BusinessRuleException(
        'This override has already been resolved',
        ErrorCode.BIZ_OVERRIDE_ALREADY_RESOLVED,
      );
    }

    if (dto.approve) {
      const loan = await this.loanModel.findById(override.loanId);
      if (loan) {
        loan.dueAt = override.newDueAt;
        await loan.save();
      }
      override.status = DueDateOverrideStatus.APPROVED;
    } else {
      override.status = DueDateOverrideStatus.REJECTED;
    }

    override.resolvedByStaffId = adminId;
    override.approvalNote = dto.note ?? null;
    await override.save();

    return override;
  }

  // ── Receipts (#1022) ─────────────────────────────────────────────────────

  async getReceipt(
    actorId: string,
    actorRole: Role,
    transactionId: string,
  ): Promise<ReceiptResponse> {
    const receipt = await this.receiptModel.findOne({ transactionId }).lean();
    if (!receipt) {
      throw new ResourceNotFoundException('Receipt not found', ErrorCode.RES_RECEIPT_NOT_FOUND);
    }

    const isOwner = receipt.patronId === actorId;
    const isStaff = actorRole === Role.LIBRARIAN || actorRole === Role.ADMIN;
    if (!isOwner && !isStaff) {
      throw new ForbiddenDomainException(
        'You do not have access to this receipt',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }

    return this.toReceiptResponse(receipt);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resolvePatronId(actorId: string, actorRole: Role, patronIdFromBody?: string): string {
    if (actorRole === Role.STUDENT) return actorId;

    if (!patronIdFromBody) {
      throw new ValidationDomainException(
        'patronId is required for staff-assisted circulation actions',
      );
    }
    return patronIdFromBody;
  }

  private assertLoanAccess(actorId: string, actorRole: Role, loan: LoanDocument): void {
    const isOwner = loan.patronId === actorId;
    const isStaff = actorRole === Role.LIBRARIAN || actorRole === Role.ADMIN;
    if (!isOwner && !isStaff) {
      throw new ForbiddenDomainException(
        'You do not have access to this loan',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
  }

  private generateTransactionId(): string {
    return crypto.randomUUID();
  }

  private toReceiptResponse(receipt: {
    transactionId: string;
    type: ReceiptType;
    itemTitle: string;
    itemAuthor: string;
    dueAt?: Date | null;
    returnedAt?: Date | null;
    policy: string;
    servicePoint: string;
    createdAt?: Date;
  }): ReceiptResponse {
    return {
      transactionId: receipt.transactionId,
      type: receipt.type,
      itemTitle: receipt.itemTitle,
      itemAuthor: receipt.itemAuthor,
      dueAt: receipt.dueAt ?? null,
      returnedAt: receipt.returnedAt ?? null,
      policy: receipt.policy,
      servicePoint: receipt.servicePoint,
      issuedAt: receipt.createdAt as Date,
    };
  }

  private toLoanSummary(
    loan: {
      _id: unknown;
      status: LoanStatus;
      checkedOutAt: Date;
      dueAt: Date;
      returnedAt?: Date | null;
      renewalCount: number;
      servicePoint: string;
    },
    item: { title: string; author: string } | null,
  ): LoanSummary {
    return {
      loanId: String(loan._id),
      itemTitle: item?.title ?? 'Unknown item',
      itemAuthor: item?.author ?? 'Unknown author',
      status: loan.status,
      checkedOutAt: loan.checkedOutAt,
      dueAt: loan.dueAt,
      returnedAt: loan.returnedAt ?? null,
      renewalCount: loan.renewalCount,
      servicePoint: loan.servicePoint,
    };
  }
}
