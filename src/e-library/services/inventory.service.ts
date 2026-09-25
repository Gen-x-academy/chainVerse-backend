import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BookCopy,
  BookCopyDocument,
  CopyCondition,
  CopyPhysicalStatus,
} from './book-copy.schema';

/**
 * Issue #997 – Inventory copy workflows (lost, damaged, repair, withdrawn).
 *
 * Model copy conditions that remove materials from circulation temporarily
 * (in_repair) or permanently (lost, withdrawn). Every transition records the
 * assessing/responsible actor and an optional note so an audit trail is kept,
 * and repair requires an explicit return-to-service approval `repairCost` to
 * move a copy back to circulation.
 */
@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(BookCopy.name)
    private readonly copyModel: Model<BookCopyDocument>,
  ) {}

  private async getCopyOrThrow(copyId: string): Promise<BookCopyDocument> {
    const copy = await this.copyModel.findById(copyId);
    if (!copy) {
      throw new NotFoundException('Copy not found');
    }
    return copy;
  }

  /**
   * Mark a copy as damaged after assessment. Logs a condition-history entry
   * keyed to the responsible actor. Does not change physical status.
   */
  async markDamaged(
    copyId: string,
    actor: string,
    note?: string,
  ): Promise<BookCopyDocument> {
    const copy = await this.getCopyOrThrow(copyId);
    copy.condition = CopyCondition.DAMAGED;
    copy.conditionHistory.push({
      condition: CopyCondition.DAMAGED,
      recordedAt: new Date(),
      recordedBy: actor,
      note,
    });
    return copy.save();
  }

  /**
   * Send a copy to repair. The copy leaves circulation until it is approved
   * back into service. `repairCost` records the assessed cost for tracking.
   */
  async sendToRepair(
    copyId: string,
    actor: string,
    repairCost?: number,
    note?: string,
  ): Promise<BookCopyDocument> {
    const copy = await this.getCopyOrThrow(copyId);
    if (copy.status === CopyPhysicalStatus.WITHDRAWN) {
      throw new BadRequestException('Cannot repair a withdrawn copy');
    }
    copy.status = CopyPhysicalStatus.IN_REPAIR;
    copy.conditionHistory.push({
      condition: CopyCondition.DAMAGED,
      recordedAt: new Date(),
      recordedBy: actor,
      note: note ?? `Sent to repair${repairCost ? ` (cost ${repairCost})` : ''}`,
    });
    copy.set('repairCost', repairCost ?? undefined);
    copy.set('repairRequestedAt', new Date());
    return copy.save();
  }

  /**
   * Approve a repaired copy back into service. This is the return-to-service
   * approval gate required to close the repair workflow.
   */
  async returnFromRepair(
    copyId: string,
    actor: string,
    condition: CopyCondition = CopyCondition.GOOD,
    note?: string,
  ): Promise<BookCopyDocument> {
    const copy = await this.getCopyOrThrow(copyId);
    if (copy.status !== CopyPhysicalStatus.IN_REPAIR) {
      throw new BadRequestException('Copy is not currently in repair');
    }
    copy.status = CopyPhysicalStatus.AVAILABLE;
    copy.condition = condition;
    copy.conditionHistory.push({
      condition,
      recordedAt: new Date(),
      recordedBy: actor,
      note: note ?? 'Returned to service after repair',
    });
    copy.set('repairCost', undefined);
    copy.set('repairRequestedAt', undefined);
    copy.set('repairCompletedAt', new Date());
    return copy.save();
  }

  /**
   * Mark a copy as lost. Permanently removes it from circulation.
   */
  async markLost(
    copyId: string,
    actor: string,
    note?: string,
  ): Promise<BookCopyDocument> {
    const copy = await this.getCopyOrThrow(copyId);
    copy.status = CopyPhysicalStatus.LOST;
    copy.conditionHistory.push({
      condition: copy.condition,
      recordedAt: new Date(),
      recordedBy: actor,
      note: note ?? 'Marked lost',
    });
    copy.retiredAt = new Date();
    copy.retiredReason = note ?? 'lost';
    return copy.save();
  }

  /**
   * Withdraw a copy permanently (e.g. deaccessioned).
   */
  async withdraw(
    copyId: string,
    actor: string,
    note?: string,
  ): Promise<BookCopyDocument> {
    const copy = await this.getCopyOrThrow(copyId);
    copy.status = CopyPhysicalStatus.WITHDRAWN;
    copy.conditionHistory.push({
      condition: copy.condition,
      recordedAt: new Date(),
      recordedBy: actor,
      note: note ?? 'Withdrawn from circulation',
    });
    copy.retiredAt = new Date();
    copy.retiredReason = note ?? 'withdrawn';
    return copy.save();
  }
}
