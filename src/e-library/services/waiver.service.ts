import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WaiverRequest,
  WaiverRequestDocument,
} from '../schemas/waiver-request.schema';
import { WaiverStatus } from '../enums/waiver-status.enum';
import {
  CHARGE_ENTRY_TYPES,
  LedgerEntryType,
} from '../enums/ledger-entry-type.enum';
import { RequestWaiverDto } from '../dto/request-waiver.dto';
import { LedgerService } from './ledger.service';
import { Role } from '../../common/enums/role.enum';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  ADMIN_AUTO_APPROVE_LIMIT_MINOR_UNITS,
  MODERATOR_AUTO_APPROVE_LIMIT_MINOR_UNITS,
} from '../e-library.constants';

export interface WaiverActor {
  id: string;
  role: Role;
}

@Injectable()
export class WaiverService {
  constructor(
    @InjectModel(WaiverRequest.name)
    private readonly waiverRequestModel: Model<WaiverRequestDocument>,
    private readonly ledgerService: LedgerService,
  ) {}

  private autoApproveThresholdFor(role: Role): number {
    return role === Role.ADMIN
      ? ADMIN_AUTO_APPROVE_LIMIT_MINOR_UNITS
      : MODERATOR_AUTO_APPROVE_LIMIT_MINOR_UNITS;
  }

  async requestWaiver(
    dto: RequestWaiverDto,
    actor: WaiverActor,
  ): Promise<WaiverRequestDocument> {
    const chargeEntry = await this.ledgerService.getEntry(dto.chargeEntryId);

    if (!CHARGE_ENTRY_TYPES.includes(chargeEntry.entryType)) {
      throw new BusinessRuleException(
        `Ledger entry ${dto.chargeEntryId} is not a chargeable entry and cannot be waived or adjusted`,
        ErrorCode.BIZ_INVALID_CHARGE_ENTRY,
      );
    }

    if (dto.entryType === LedgerEntryType.WAIVER) {
      const alreadyWaived = await this.ledgerService.sumEntriesReferencing(
        dto.chargeEntryId,
      );
      const remaining = chargeEntry.amountMinorUnits - alreadyWaived;
      if (dto.amountMinorUnits > remaining) {
        throw new BusinessRuleException(
          `Requested waiver of ${dto.amountMinorUnits} exceeds the remaining waivable amount of ${remaining} on charge ${dto.chargeEntryId}`,
          ErrorCode.BIZ_WAIVER_EXCEEDS_CHARGE,
        );
      }
    }

    const threshold = this.autoApproveThresholdFor(actor.role);
    const withinAutoLimit = dto.amountMinorUnits <= threshold;

    const waiverRequest = await this.waiverRequestModel.create({
      patronId: chargeEntry.patronId,
      chargeEntryId: dto.chargeEntryId,
      entryType: dto.entryType,
      amountMinorUnits: dto.amountMinorUnits,
      currency: chargeEntry.currency,
      reason: dto.reason,
      requestedBy: actor.id,
      requestedByRole: actor.role,
      thresholdMinorUnitsAtRequest: threshold,
      status: withinAutoLimit
        ? WaiverStatus.AUTO_APPROVED
        : WaiverStatus.PENDING_APPROVAL,
    });

    if (withinAutoLimit) {
      await this.applyWaiver(waiverRequest, actor.id);
    }

    return waiverRequest;
  }

  async decideWaiver(
    id: string,
    decision: 'approved' | 'rejected',
    notes: string | undefined,
    actor: WaiverActor,
  ): Promise<WaiverRequestDocument> {
    const waiverRequest = await this.getWaiverRequest(id);

    if (waiverRequest.status !== WaiverStatus.PENDING_APPROVAL) {
      throw new BusinessRuleException(
        `Waiver request ${id} has already been decided (${waiverRequest.status})`,
        ErrorCode.BIZ_WAIVER_ALREADY_DECIDED,
      );
    }

    // Maker-checker: the person who requested the waiver cannot also approve it.
    if (waiverRequest.requestedBy === actor.id) {
      throw new ForbiddenDomainException(
        'A waiver request cannot be approved by the same actor who requested it',
        ErrorCode.BIZ_WAIVER_SELF_APPROVAL,
      );
    }

    waiverRequest.decidedBy = actor.id;
    waiverRequest.decidedAt = new Date();
    waiverRequest.decisionNotes = notes ?? null;

    if (decision === 'rejected') {
      waiverRequest.status = WaiverStatus.REJECTED;
      await waiverRequest.save();
      return waiverRequest;
    }

    waiverRequest.status = WaiverStatus.APPROVED;
    await this.applyWaiver(waiverRequest, actor.id);
    return waiverRequest;
  }

  async getWaiverRequest(id: string): Promise<WaiverRequestDocument> {
    const waiverRequest = await this.waiverRequestModel.findById(id);
    if (!waiverRequest) {
      throw new ResourceNotFoundException(
        `Waiver request ${id} not found`,
        ErrorCode.RES_WAIVER_REQUEST_NOT_FOUND,
      );
    }
    return waiverRequest;
  }

  async listWaivers(filter: {
    patronId?: string;
    status?: WaiverStatus;
  }): Promise<WaiverRequestDocument[]> {
    return this.waiverRequestModel
      .find({ ...filter })
      .sort({ createdAt: -1 })
      .exec();
  }

  private async applyWaiver(
    waiverRequest: WaiverRequestDocument,
    postedBy: string,
  ): Promise<void> {
    const signedAmount =
      waiverRequest.entryType === LedgerEntryType.WAIVER
        ? -Math.abs(waiverRequest.amountMinorUnits)
        : waiverRequest.amountMinorUnits;

    const entry = await this.ledgerService.postEntry({
      patronId: waiverRequest.patronId,
      entryType: waiverRequest.entryType,
      amountMinorUnits: signedAmount,
      currency: waiverRequest.currency,
      reason: waiverRequest.reason,
      referenceEntryId: waiverRequest.chargeEntryId,
      createdBy: postedBy,
      metadata: { waiverRequestId: waiverRequest.id },
    });

    waiverRequest.resultingLedgerEntryId = entry.id;
    waiverRequest.balanceBeforeMinorUnits = entry.balanceBeforeMinorUnits;
    waiverRequest.balanceAfterMinorUnits = entry.balanceAfterMinorUnits;
    await waiverRequest.save();
  }
}
