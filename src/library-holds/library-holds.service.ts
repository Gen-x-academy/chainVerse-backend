import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { Book, BookDocument } from './schemas/book.schema';
import { BookCopy, BookCopyDocument } from './schemas/book-copy.schema';
import {
  LibraryHold,
  LibraryHoldDocument,
} from './schemas/library-hold.schema';
import {
  LibraryClosure,
  LibraryClosureDocument,
} from './schemas/library-closure.schema';
import {
  HoldAuditLog,
  HoldAuditLogDocument,
} from './schemas/hold-audit-log.schema';
import { HoldStatus } from './enums/hold-status.enum';
import { HoldPriority, HOLD_PRIORITY_RANK } from './enums/hold-priority.enum';
import { CopyStatus } from './enums/copy-status.enum';
import { LendableType } from './enums/lendable-type.enum';
import { HoldAuditAction } from './enums/hold-audit-action.enum';
import { Role } from '../common/enums/role.enum';
import { CancelHoldDto } from './dto/cancel-hold.dto';
import { ChangePriorityDto } from './dto/change-priority.dto';
import { computePickupDeadline } from './utils/pickup-window.util';

const DEFAULT_PRIORITY_BY_ROLE: Partial<Record<string, HoldPriority>> = {
  [Role.TUTOR]: HoldPriority.HIGH,
  [Role.STUDENT]: HoldPriority.NORMAL,
};

interface Actor {
  id: string;
  role: string;
}

@Injectable()
export class LibraryHoldsService {
  private readonly logger = new Logger(LibraryHoldsService.name);

  constructor(
    @InjectModel(Book.name) private readonly bookModel: Model<BookDocument>,
    @InjectModel(BookCopy.name)
    private readonly bookCopyModel: Model<BookCopyDocument>,
    @InjectModel(LibraryHold.name)
    private readonly holdModel: Model<LibraryHoldDocument>,
    @InjectModel(LibraryClosure.name)
    private readonly closureModel: Model<LibraryClosureDocument>,
    @InjectModel(HoldAuditLog.name)
    private readonly auditModel: Model<HoldAuditLogDocument>,
  ) {}

  async placeHold(bookId: string, actor: Actor): Promise<LibraryHold> {
    const book = await this.bookModel.findById(bookId).exec();
    if (!book || !book.isActive) {
      throw new NotFoundException('Book not found');
    }

    const existing = await this.findActiveOrReadyHold(bookId, actor.id);
    if (existing) {
      return existing;
    }

    const activeHoldCount = await this.holdModel.countDocuments({
      userId: actor.id,
      status: { $in: [HoldStatus.ACTIVE, HoldStatus.READY] },
    });
    if (activeHoldCount >= book.maxActiveHoldsPerUser) {
      throw new ConflictException(
        `Active hold limit reached (${book.maxActiveHoldsPerUser})`,
      );
    }

    const priority =
      DEFAULT_PRIORITY_BY_ROLE[actor.role] ?? HoldPriority.NORMAL;

    let hold: LibraryHoldDocument;
    try {
      hold = await new this.holdModel({
        bookId,
        userId: actor.id,
        userRole: actor.role,
        status: HoldStatus.ACTIVE,
        priority,
        priorityRank: HOLD_PRIORITY_RANK[priority],
        placedAt: new Date(),
      }).save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const winner = await this.findActiveOrReadyHold(bookId, actor.id);
        if (winner) return winner;
      }
      throw error;
    }

    await this.logAudit(hold.id, HoldAuditAction.PLACED, actor, { priority });
    await this.allocateNext(bookId);

    const placed = (await this.holdModel.findById(hold.id).exec()) ?? hold;
    return this.toHoldView(placed);
  }

  async listMyHolds(userId: string) {
    const holds = await this.holdModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .exec();
    return Promise.all(holds.map((hold) => this.toHoldView(hold)));
  }

  async getHold(holdId: string, actor: Actor) {
    const hold = await this.holdModel.findById(holdId).exec();
    if (!hold) {
      throw new NotFoundException('Hold not found');
    }
    if (hold.userId !== actor.id && !this.isStaff(actor.role)) {
      throw new ForbiddenException('You do not have access to this hold');
    }
    return this.toHoldView(hold);
  }

  async cancelHold(
    holdId: string,
    actor: Actor,
    dto: CancelHoldDto,
  ): Promise<LibraryHold> {
    const hold = await this.holdModel.findById(holdId).exec();
    if (!hold) {
      throw new NotFoundException('Hold not found');
    }

    const isOwner = hold.userId === actor.id;
    const isStaff = this.isStaff(actor.role);
    if (!isOwner && !isStaff) {
      throw new ForbiddenException('You do not have access to this hold');
    }
    if (isStaff && !isOwner && !dto.reason?.trim()) {
      throw new BadRequestException(
        'A reason is required for staff-initiated cancellations',
      );
    }
    if (![HoldStatus.ACTIVE, HoldStatus.READY].includes(hold.status)) {
      throw new ConflictException(
        `Hold cannot be cancelled from status "${hold.status}"`,
      );
    }

    const cancelled = await this.holdModel
      .findOneAndUpdate(
        { _id: holdId, status: { $in: [HoldStatus.ACTIVE, HoldStatus.READY] } },
        {
          $set: {
            status: HoldStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelledBy: actor.id,
            cancelledByRole: actor.role,
            cancelReason: dto.reason ?? null,
          },
        },
        { new: true },
      )
      .exec();

    if (!cancelled) {
      throw new ConflictException('Hold was already resolved');
    }

    await this.logAudit(hold.id, HoldAuditAction.CANCELLED, actor, {
      reason: dto.reason ?? null,
      wasReady: Boolean(cancelled.assignedCopyId),
    });

    // assignedCopyId is only ever set on a READY hold, so its presence on the
    // post-update document (untouched by the $set above) tells us whether a
    // copy needs releasing back into the pool — independent of any race
    // between the pre-check read and the atomic cancellation above.
    if (cancelled.assignedCopyId) {
      await this.releaseCopy(cancelled.assignedCopyId, cancelled.bookId);
    }

    return cancelled;
  }

  async changePriority(
    holdId: string,
    actor: Actor,
    dto: ChangePriorityDto,
  ): Promise<LibraryHold> {
    const hold = await this.holdModel
      .findOneAndUpdate(
        { _id: holdId, status: HoldStatus.ACTIVE },
        {
          $set: {
            priority: dto.priority,
            priorityRank: HOLD_PRIORITY_RANK[dto.priority],
            priorityReason: dto.reason,
          },
        },
        { new: true },
      )
      .exec();

    if (!hold) {
      const exists = await this.holdModel.exists({ _id: holdId });
      if (!exists) throw new NotFoundException('Hold not found');
      throw new ConflictException(
        'Priority can only be changed while a hold is queued (active)',
      );
    }

    await this.logAudit(hold.id, HoldAuditAction.PRIORITY_CHANGED, actor, {
      priority: dto.priority,
      reason: dto.reason,
    });

    return hold;
  }

  async markPickedUp(holdId: string, actor: Actor): Promise<LibraryHold> {
    const hold = await this.holdModel
      .findOneAndUpdate(
        { _id: holdId, status: HoldStatus.READY },
        { $set: { status: HoldStatus.FULFILLED, fulfilledAt: new Date() } },
        { new: true },
      )
      .exec();

    if (!hold) {
      const exists = await this.holdModel.exists({ _id: holdId });
      if (!exists) throw new NotFoundException('Hold not found');
      throw new ConflictException('Hold is not ready for pickup');
    }

    if (hold.assignedCopyId) {
      await this.bookCopyModel
        .updateOne(
          { _id: hold.assignedCopyId },
          { $set: { status: CopyStatus.CHECKED_OUT } },
        )
        .exec();
    }

    await this.logAudit(hold.id, HoldAuditAction.FULFILLED, actor, {});
    return hold;
  }

  async returnCopy(copyId: string, actor: Actor): Promise<BookCopy> {
    const copy = await this.bookCopyModel
      .findOneAndUpdate(
        { _id: copyId, status: { $ne: CopyStatus.AVAILABLE } },
        {
          $set: { status: CopyStatus.AVAILABLE },
          $unset: { currentHoldId: '' },
        },
        { new: true },
      )
      .exec();

    if (!copy) {
      const exists = await this.bookCopyModel.exists({ _id: copyId });
      if (!exists) throw new NotFoundException('Copy not found');
      throw new ConflictException('Copy is already available');
    }

    this.logger.log(`Copy ${copyId} returned by ${actor.id}`);
    await this.allocateNext(copy.bookId);
    return copy;
  }

  /** Runs hourly; also invoked manually via POST /library/holds/expire-pickups. */
  @Cron('0 * * * *')
  async expirePickupWindows(): Promise<number> {
    const now = new Date();
    const dueHolds = await this.holdModel
      .find({ status: HoldStatus.READY, pickupExpiresAt: { $lte: now } })
      .exec();

    let expiredCount = 0;
    for (const hold of dueHolds) {
      const expired = await this.holdModel
        .findOneAndUpdate(
          { _id: hold.id, status: HoldStatus.READY },
          { $set: { status: HoldStatus.EXPIRED, expiredAt: now } },
          { new: true },
        )
        .exec();

      if (!expired) continue;
      expiredCount += 1;

      await this.logAudit(hold.id, HoldAuditAction.EXPIRED, null, {
        pickupExpiresAt: hold.pickupExpiresAt,
      });

      if (expired.assignedCopyId) {
        await this.releaseCopy(expired.assignedCopyId, expired.bookId);
      }
    }

    return expiredCount;
  }

  async computeQueuePosition(hold: LibraryHoldDocument): Promise<number> {
    if (hold.status !== HoldStatus.ACTIVE) return 0;
    const ahead = await this.holdModel.countDocuments({
      bookId: hold.bookId,
      status: HoldStatus.ACTIVE,
      $or: [
        { priorityRank: { $gt: hold.priorityRank } },
        { priorityRank: hold.priorityRank, _id: { $lt: hold._id } },
      ],
    });
    return ahead + 1;
  }

  // --- internal helpers -----------------------------------------------

  private async toHoldView(hold: LibraryHoldDocument) {
    const queuePosition = await this.computeQueuePosition(hold);
    return { ...hold.toObject(), queuePosition };
  }

  private findActiveOrReadyHold(bookId: string, userId: string) {
    return this.holdModel
      .findOne({
        bookId,
        userId,
        status: { $in: [HoldStatus.ACTIVE, HoldStatus.READY] },
      })
      .exec();
  }

  private async releaseCopy(copyId: string, bookId: string): Promise<void> {
    await this.bookCopyModel
      .updateOne(
        { _id: copyId, status: CopyStatus.ON_HOLD },
        {
          $set: { status: CopyStatus.AVAILABLE },
          $unset: { currentHoldId: '' },
        },
      )
      .exec();
    await this.allocateNext(bookId);
  }

  /**
   * Atomically claims one AVAILABLE copy and hands it to the next queued
   * hold (highest priorityRank first, ties broken by insertion order via
   * _id). Both claims are single-document compare-and-swap updates, so
   * concurrent callers for the same book can never award the same copy
   * twice or advance the same hold twice — this is what makes allocation
   * "exactly once" without needing a multi-document transaction.
   */
  private async allocateNext(bookId: string): Promise<void> {
    const book = await this.bookModel.findById(bookId).exec();
    if (!book) return;

    const isPhysical = book.type === LendableType.PHYSICAL;
    const claimedStatus = isPhysical
      ? CopyStatus.ON_HOLD
      : CopyStatus.CHECKED_OUT;

    const copy = await this.bookCopyModel
      .findOneAndUpdate(
        { bookId, status: CopyStatus.AVAILABLE },
        { $set: { status: claimedStatus } },
        { new: true },
      )
      .exec();
    if (!copy) return;

    const now = new Date();
    const update = isPhysical
      ? {
          $set: {
            status: HoldStatus.READY,
            assignedCopyId: copy.id,
            readyAt: now,
            pickupExpiresAt: computePickupDeadline(
              now,
              book.pickupWindowDays,
              await this.getClosureDateSet(),
            ),
          },
        }
      : {
          $set: {
            status: HoldStatus.FULFILLED,
            assignedCopyId: copy.id,
            readyAt: now,
            fulfilledAt: now,
          },
        };

    const hold = await this.holdModel
      .findOneAndUpdate({ bookId, status: HoldStatus.ACTIVE }, update, {
        sort: { priorityRank: -1, _id: 1 },
        new: true,
      })
      .exec();

    if (!hold) {
      // Nobody is waiting; put the copy back into the pool.
      await this.bookCopyModel
        .updateOne(
          { _id: copy.id, status: claimedStatus },
          { $set: { status: CopyStatus.AVAILABLE } },
        )
        .exec();
      return;
    }

    await this.bookCopyModel
      .updateOne({ _id: copy.id }, { $set: { currentHoldId: hold.id } })
      .exec();

    await this.logAudit(
      hold.id,
      isPhysical ? HoldAuditAction.READY : HoldAuditAction.FULFILLED,
      null,
      { copyId: copy.id },
    );
  }

  private async getClosureDateSet(): Promise<Set<string>> {
    const closures = await this.closureModel.find().exec();
    return new Set(closures.map((c) => c.date.toISOString().slice(0, 10)));
  }

  private isStaff(role: string): boolean {
    return (
      role === (Role.ADMIN as string) || role === (Role.MODERATOR as string)
    );
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (error as { code?: number } | null)?.code === 11000;
  }

  private async logAudit(
    holdId: string,
    action: HoldAuditAction,
    actor: Actor | null,
    details: Record<string, unknown>,
  ): Promise<void> {
    await new this.auditModel({
      holdId,
      action,
      actorId: actor?.id ?? null,
      actorRole: actor?.role ?? null,
      details,
    }).save();
  }
}
