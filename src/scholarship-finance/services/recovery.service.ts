import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BusinessRuleException,
  ErrorCode,
  ForbiddenDomainException,
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors';
import { DomainEvents } from '../../events/event-names';
import {
  CollectionMethod,
  FinancePermission,
  LedgerSourceType,
  RecoveryStatus,
} from '../domain/finance.enums';
import {
  assetKey,
  fundAccount,
  LedgerAccounts,
} from '../domain/ledger-accounts';
import {
  CreateRecoveryClaimDto,
  ListRecoveriesQueryDto,
  RecordCollectionDto,
} from '../dto/recovery.dto';
import { FinanceActorContext } from '../guards/finance-access.guard';
import {
  RecoveryClaim,
  RecoveryClaimDocument,
} from '../schemas/recovery-claim.schema';
import {
  RecoveryCollection,
  RecoveryCollectionDocument,
} from '../schemas/recovery-collection.schema';
import { FinanceAuditService } from './finance-audit.service';
import { LedgerService } from './ledger.service';

const COLLECTIBLE = [RecoveryStatus.OPEN, RecoveryStatus.PARTIALLY_COLLECTED];

export interface RecoveryReconciliation {
  organizationId: string;
  balanced: boolean;
  assets: {
    assetKey: string;
    openClaimsOutstandingMinor: number;
    ledgerReceivableMinor: number;
    ledgerContraMinor: number;
    collectedPerClaimsMinor: number;
    collectedPerRecordsMinor: number;
    balanced: boolean;
  }[];
  claimMismatches: {
    claimId: string;
    claimCollectedMinor: number;
    recordsCollectedMinor: number;
  }[];
}

/**
 * Recovery / clawback claims.
 *
 * Guarantees:
 * - Every claim records its reason and legal basis (policy + clause).
 * - A claim only becomes collectible after a second person approves it,
 *   at which point a recipient notice event is emitted.
 * - The platform never debits a recipient's wallet. Money is only recorded
 *   as collected when it has been received and evidenced by an external
 *   reference; offsets against future awards require recorded consent.
 * - Collections can never exceed the outstanding amount, and the ledger
 *   receivable reconciles to the sum outstanding on open claims.
 */
@Injectable()
export class RecoveryService {
  constructor(
    @InjectModel(RecoveryClaim.name)
    private readonly claimModel: Model<RecoveryClaimDocument>,
    @InjectModel(RecoveryCollection.name)
    private readonly collectionModel: Model<RecoveryCollectionDocument>,
    private readonly ledger: LedgerService,
    private readonly audit: FinanceAuditService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    organizationId: string,
    dto: CreateRecoveryClaimDto,
    actorId: string,
  ) {
    const claim = await this.claimModel.create({
      organizationId,
      recipientId: dto.recipientId,
      programId: dto.programId ?? null,
      awardReference: dto.awardReference ?? null,
      assetKey: assetKey({
        code: dto.asset.code,
        issuer: dto.asset.issuer ?? null,
      }),
      reason: dto.reason,
      legalBasis: dto.legalBasis,
      evidenceRefs: dto.evidenceRefs ?? [],
      claimedMinor: dto.amountMinor,
      createdBy: actorId,
    });
    await this.audit.record({
      organizationId,
      entityType: 'recovery_claim',
      entityId: claim.id,
      action: 'drafted',
      actorId,
      reason: dto.legalBasis.description,
      details: {
        recoveryReason: dto.reason,
        policyReference: dto.legalBasis.policyReference,
        clause: dto.legalBasis.clause,
        claimedMinor: dto.amountMinor,
        assetKey: claim.assetKey,
      },
    });
    return claim;
  }

  async approve(organizationId: string, id: string, actorId: string) {
    const claim = await this.getDoc(organizationId, id);
    if (claim.status !== RecoveryStatus.DRAFT) {
      throw new BusinessRuleException(
        `Claim is ${claim.status}`,
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }
    if (claim.createdBy === actorId) {
      throw new BusinessRuleException(
        'A recovery claim must be approved by someone other than its author',
        ErrorCode.BIZ_SEPARATION_OF_DUTIES,
      );
    }

    const opened = await this.claimModel.findOneAndUpdate(
      { _id: claim._id, organizationId, status: RecoveryStatus.DRAFT },
      {
        $set: {
          status: RecoveryStatus.OPEN,
          approvedBy: actorId,
          noticeIssuedAt: new Date(),
        },
      },
      { new: true },
    );
    if (!opened) {
      throw new BusinessRuleException(
        'Claim was modified concurrently',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }

    try {
      const journal = await this.ledger.post({
        organizationId,
        assetKey: claim.assetKey,
        idempotencyKey: `recovery-open:${claim.id}`,
        sourceType: LedgerSourceType.RECOVERY_OPENED,
        sourceId: claim.id,
        lines: [
          {
            account: LedgerAccounts.RECOVERY_RECEIVABLE,
            debitMinor: claim.claimedMinor,
          },
          {
            account: LedgerAccounts.RECOVERY_CONTRA,
            creditMinor: claim.claimedMinor,
          },
        ],
        memo: `Recovery claim opened (${claim.reason}) under ${claim.legalBasis.policyReference} ${claim.legalBasis.clause}`,
        postedBy: actorId,
      });
      opened.openingJournalId = journal.id;
      await opened.save();
    } catch (err) {
      await this.claimModel.updateOne(
        { _id: claim._id, status: RecoveryStatus.OPEN, openingJournalId: null },
        {
          $set: {
            status: RecoveryStatus.DRAFT,
            approvedBy: null,
            noticeIssuedAt: null,
          },
        },
      );
      throw err;
    }

    await this.audit.record({
      organizationId,
      entityType: 'recovery_claim',
      entityId: claim.id,
      action: 'approved_and_noticed',
      actorId,
      details: { openingJournalId: opened.openingJournalId },
    });
    // Notification listeners deliver the notice (reason, legal basis, amount, how to repay).
    this.events.emit(DomainEvents.SCHOLARSHIP_RECOVERY_OPENED, {
      organizationId,
      claimId: claim.id,
      recipientId: claim.recipientId,
      assetKey: claim.assetKey,
      claimedMinor: claim.claimedMinor,
      reason: claim.reason,
      legalBasis: claim.legalBasis,
    });
    return opened;
  }

  async recordCollection(
    organizationId: string,
    id: string,
    dto: RecordCollectionDto,
    actorId: string,
  ) {
    if (
      dto.method === CollectionMethod.AWARD_OFFSET &&
      !dto.recipientConsentRef
    ) {
      throw new ValidationDomainException(
        'award_offset collections require recipientConsentRef',
      );
    }
    const receivedAt = new Date(dto.receivedAt);
    if (receivedAt.getTime() > Date.now() + 5 * 60_000) {
      throw new ValidationDomainException('receivedAt cannot be in the future');
    }
    const claim = await this.getDoc(organizationId, id);
    if (!COLLECTIBLE.includes(claim.status) || !claim.noticeIssuedAt) {
      throw new BusinessRuleException(
        'Collections can only be recorded against approved, noticed, open claims',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }
    if (
      await this.collectionModel.exists({
        organizationId,
        externalReference: dto.externalReference,
      })
    ) {
      throw new ResourceConflictException(
        'This collection reference was already recorded',
        ErrorCode.BIZ_DUPLICATE_REQUEST,
      );
    }

    // Reserve the amount against the outstanding balance atomically.
    const updated = await this.claimModel.findOneAndUpdate(
      {
        _id: claim._id,
        organizationId,
        status: { $in: COLLECTIBLE },
        $expr: {
          $lte: [
            { $add: ['$collectedMinor', '$writtenOffMinor', dto.amountMinor] },
            '$claimedMinor',
          ],
        },
      },
      { $inc: { collectedMinor: dto.amountMinor } },
      { new: true },
    );
    if (!updated) {
      throw new BusinessRuleException(
        'Collection exceeds the outstanding claim amount',
        ErrorCode.BIZ_AMOUNT_EXCEEDS_OUTSTANDING,
      );
    }
    const undoClaim = () =>
      this.claimModel.updateOne(
        { _id: claim._id },
        { $inc: { collectedMinor: -dto.amountMinor } },
      );

    const collectionId = new Types.ObjectId();
    let journalId: string;
    try {
      const journal = await this.ledger.post({
        organizationId,
        assetKey: claim.assetKey,
        // Keyed on the external reference so the same receipt can never post twice.
        idempotencyKey: `recovery-collection:${organizationId}:${dto.externalReference}`,
        sourceType: LedgerSourceType.RECOVERY_COLLECTION,
        sourceId: collectionId.toHexString(),
        lines: [
          { account: LedgerAccounts.CUSTODY, debitMinor: dto.amountMinor },
          {
            account: fundAccount(claim.programId),
            creditMinor: dto.amountMinor,
          },
          {
            account: LedgerAccounts.RECOVERY_CONTRA,
            debitMinor: dto.amountMinor,
          },
          {
            account: LedgerAccounts.RECOVERY_RECEIVABLE,
            creditMinor: dto.amountMinor,
          },
        ],
        memo: `Recovery collection (${dto.method}) ${dto.externalReference}`,
        postedBy: actorId,
      });
      if (journal.sourceId !== collectionId.toHexString()) {
        throw new ResourceConflictException(
          'This collection reference was already recorded',
          ErrorCode.BIZ_DUPLICATE_REQUEST,
        );
      }
      journalId = journal.id;
    } catch (err) {
      await undoClaim();
      throw err;
    }

    const collection = await this.collectionModel.create({
      _id: collectionId,
      organizationId,
      claimId: claim.id,
      assetKey: claim.assetKey,
      amountMinor: dto.amountMinor,
      method: dto.method,
      externalReference: dto.externalReference,
      recipientConsentRef: dto.recipientConsentRef ?? null,
      receivedAt,
      recordedBy: actorId,
      journalId,
    });

    const settled =
      updated.collectedMinor + updated.writtenOffMinor >= updated.claimedMinor;
    await this.claimModel.updateOne(
      { _id: claim._id, status: { $in: COLLECTIBLE } },
      {
        $set: {
          status: settled
            ? RecoveryStatus.SETTLED
            : RecoveryStatus.PARTIALLY_COLLECTED,
        },
      },
    );

    await this.audit.record({
      organizationId,
      entityType: 'recovery_claim',
      entityId: claim.id,
      action: 'collection_recorded',
      actorId,
      details: {
        collectionId: collection.id,
        amountMinor: dto.amountMinor,
        method: dto.method,
        externalReference: dto.externalReference,
        journalId,
        settled,
      },
    });
    return { claim: await this.get(organizationId, id), collection };
  }

  /** Writes off the remaining outstanding amount. Posts the receivable down; nothing is deleted. */
  async writeOff(
    organizationId: string,
    id: string,
    reason: string,
    actorId: string,
  ) {
    const claim = await this.getDoc(organizationId, id);
    if (!COLLECTIBLE.includes(claim.status)) {
      throw new BusinessRuleException(
        `Claim is ${claim.status}`,
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }
    const outstanding =
      claim.claimedMinor - claim.collectedMinor - claim.writtenOffMinor;

    const updated = await this.claimModel.findOneAndUpdate(
      {
        _id: claim._id,
        organizationId,
        status: claim.status,
        collectedMinor: claim.collectedMinor,
        writtenOffMinor: claim.writtenOffMinor,
      },
      {
        $inc: { writtenOffMinor: outstanding },
        $set: { status: RecoveryStatus.WRITTEN_OFF, resolutionReason: reason },
      },
      { new: true },
    );
    if (!updated) {
      throw new BusinessRuleException(
        'Claim was modified concurrently',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }

    try {
      await this.ledger.post({
        organizationId,
        assetKey: claim.assetKey,
        idempotencyKey: `recovery-writeoff:${claim.id}`,
        sourceType: LedgerSourceType.RECOVERY_WRITE_OFF,
        sourceId: claim.id,
        lines: [
          { account: LedgerAccounts.RECOVERY_CONTRA, debitMinor: outstanding },
          {
            account: LedgerAccounts.RECOVERY_RECEIVABLE,
            creditMinor: outstanding,
          },
        ],
        memo: `Recovery write-off: ${reason}`,
        postedBy: actorId,
      });
    } catch (err) {
      await this.claimModel.updateOne(
        { _id: claim._id, status: RecoveryStatus.WRITTEN_OFF },
        {
          $inc: { writtenOffMinor: -outstanding },
          $set: { status: claim.status, resolutionReason: null },
        },
      );
      throw err;
    }

    await this.audit.record({
      organizationId,
      entityType: 'recovery_claim',
      entityId: claim.id,
      action: 'written_off',
      actorId,
      reason,
      details: { writtenOffMinor: outstanding },
    });
    return updated;
  }

  /**
   * Draft claims can be cancelled by operators. Open claims with no
   * collections can be cancelled by approvers; the opening journal is reversed.
   */
  async cancel(
    organizationId: string,
    id: string,
    reason: string,
    actor: FinanceActorContext,
  ) {
    const claim = await this.getDoc(organizationId, id);

    if (claim.status === RecoveryStatus.DRAFT) {
      const updated = await this.claimModel.findOneAndUpdate(
        { _id: claim._id, organizationId, status: RecoveryStatus.DRAFT },
        {
          $set: { status: RecoveryStatus.CANCELLED, resolutionReason: reason },
        },
        { new: true },
      );
      if (!updated) {
        throw new BusinessRuleException(
          'Claim was modified concurrently',
          ErrorCode.BIZ_INVALID_STATE_TRANSITION,
        );
      }
      await this.auditCancel(claim, actor.userId, reason);
      return updated;
    }

    if (claim.status !== RecoveryStatus.OPEN || claim.collectedMinor > 0) {
      throw new BusinessRuleException(
        'Only drafts or open claims without collections can be cancelled; use write-off otherwise',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }
    if (!actor.permissions.includes(FinancePermission.APPROVE)) {
      throw new ForbiddenDomainException(
        'Cancelling an approved claim requires approver permission',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }

    const updated = await this.claimModel.findOneAndUpdate(
      {
        _id: claim._id,
        organizationId,
        status: RecoveryStatus.OPEN,
        collectedMinor: 0,
      },
      { $set: { status: RecoveryStatus.CANCELLED, resolutionReason: reason } },
      { new: true },
    );
    if (!updated) {
      throw new BusinessRuleException(
        'Claim was modified concurrently',
        ErrorCode.BIZ_INVALID_STATE_TRANSITION,
      );
    }
    try {
      await this.ledger.reverse(organizationId, claim.openingJournalId!, {
        sourceType: LedgerSourceType.RECOVERY_CANCELLED,
        sourceId: claim.id,
        memo: `Recovery claim cancelled: ${reason}`,
        postedBy: actor.userId,
      });
    } catch (err) {
      await this.claimModel.updateOne(
        { _id: claim._id, status: RecoveryStatus.CANCELLED },
        { $set: { status: RecoveryStatus.OPEN, resolutionReason: null } },
      );
      throw err;
    }
    await this.auditCancel(claim, actor.userId, reason);
    return updated;
  }

  list(organizationId: string, query: ListRecoveriesQueryDto) {
    const filter: Record<string, unknown> = { organizationId };
    if (query.status) filter.status = query.status;
    if (query.recipientId) filter.recipientId = query.recipientId;
    return this.claimModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(query.skip ?? 0)
      .limit(query.limit ?? 50)
      .lean();
  }

  async get(organizationId: string, id: string) {
    return (await this.getDoc(organizationId, id)).toObject();
  }

  listCollections(organizationId: string, claimId: string) {
    return this.collectionModel
      .find({ organizationId, claimId })
      .sort({ receivedAt: 1 })
      .lean();
  }

  /**
   * Reconciles recoveries three ways per asset:
   * 1. Σ outstanding on open claims  == ledger recovery receivable (and contra)
   * 2. Σ claim.collectedMinor        == Σ recorded collections
   * 3. per claim: collectedMinor     == Σ its collection records
   */
  async reconcile(organizationId: string): Promise<RecoveryReconciliation> {
    const claimTotals = await this.claimModel.aggregate<{
      _id: string;
      outstanding: number;
      collected: number;
    }>([
      {
        $match: {
          organizationId,
          status: { $nin: [RecoveryStatus.DRAFT, RecoveryStatus.CANCELLED] },
        },
      },
      {
        $group: {
          _id: '$assetKey',
          outstanding: {
            $sum: {
              $cond: [
                { $in: ['$status', COLLECTIBLE] },
                {
                  $subtract: [
                    '$claimedMinor',
                    { $add: ['$collectedMinor', '$writtenOffMinor'] },
                  ],
                },
                0,
              ],
            },
          },
          collected: { $sum: '$collectedMinor' },
        },
      },
    ]);
    const recordTotals = await this.collectionModel.aggregate<{
      _id: string;
      collected: number;
    }>([
      { $match: { organizationId } },
      { $group: { _id: '$assetKey', collected: { $sum: '$amountMinor' } } },
    ]);

    const assetKeys = new Set([
      ...claimTotals.map((c) => c._id),
      ...recordTotals.map((r) => r._id),
    ]);
    const assets: RecoveryReconciliation['assets'] = [];
    for (const key of assetKeys) {
      const c = claimTotals.find((t) => t._id === key);
      const r = recordTotals.find((t) => t._id === key);
      const receivable = await this.ledger.getBalance(
        organizationId,
        LedgerAccounts.RECOVERY_RECEIVABLE,
        key,
      );
      const contra = await this.ledger.getBalance(
        organizationId,
        LedgerAccounts.RECOVERY_CONTRA,
        key,
      );
      const row = {
        assetKey: key,
        openClaimsOutstandingMinor: c?.outstanding ?? 0,
        ledgerReceivableMinor: receivable,
        ledgerContraMinor: contra,
        collectedPerClaimsMinor: c?.collected ?? 0,
        collectedPerRecordsMinor: r?.collected ?? 0,
        balanced: false,
      };
      row.balanced =
        row.openClaimsOutstandingMinor === row.ledgerReceivableMinor &&
        row.ledgerReceivableMinor === row.ledgerContraMinor &&
        row.collectedPerClaimsMinor === row.collectedPerRecordsMinor;
      assets.push(row);
    }

    const perClaim = await this.collectionModel.aggregate<{
      _id: string;
      collected: number;
    }>([
      { $match: { organizationId } },
      { $group: { _id: '$claimId', collected: { $sum: '$amountMinor' } } },
    ]);
    const perClaimMap = new Map(perClaim.map((p) => [p._id, p.collected]));
    const claims = await this.claimModel
      .find({
        organizationId,
        $or: [
          { collectedMinor: { $gt: 0 } },
          { _id: { $in: perClaim.map((p) => this.oid(p._id)) } },
        ],
      })
      .select('_id collectedMinor')
      .lean();
    const claimMismatches = claims
      .map((cl) => ({
        claimId: String(cl._id),
        claimCollectedMinor: cl.collectedMinor,
        recordsCollectedMinor: perClaimMap.get(String(cl._id)) ?? 0,
      }))
      .filter((m) => m.claimCollectedMinor !== m.recordsCollectedMinor);

    return {
      organizationId,
      balanced: assets.every((a) => a.balanced) && claimMismatches.length === 0,
      assets,
      claimMismatches,
    };
  }

  /** Tenants with recovery activity, for the integrity job. */
  async organizationsWithClaims(): Promise<string[]> {
    return this.claimModel.distinct('organizationId');
  }

  private auditCancel(
    claim: RecoveryClaimDocument,
    actorId: string,
    reason: string,
  ) {
    return this.audit.record({
      organizationId: claim.organizationId,
      entityType: 'recovery_claim',
      entityId: claim.id,
      action: 'cancelled',
      actorId,
      reason,
    });
  }

  private async getDoc(organizationId: string, id: string) {
    const claim = await this.claimModel.findOne({
      _id: this.oid(id),
      organizationId,
    });
    if (!claim) throw new ResourceNotFoundException('Recovery claim not found');
    return claim;
  }

  private oid(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id))
      throw new ResourceNotFoundException('Resource not found');
    return new Types.ObjectId(id);
  }
}
