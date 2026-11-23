import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import {
  ErrorCode,
  ForbiddenDomainException,
  ResourceNotFoundException,
} from '../../common/errors';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import {
  ActivateAmendmentDto,
  ApproveAmendmentDto,
  PreviewAmendmentDto,
  ProposeAmendmentDto,
  RejectAmendmentDto,
} from './dto/agreement-amendment.dto';
import {
  AgreementAmendment,
  AgreementAmendmentDocument,
  AmendmentImpact,
  AmendmentStatus,
  computeAmendmentHash,
} from './schemas/agreement-amendment.schema';

export interface AmendmentActor {
  id: string;
  role: string;
}

const MATERIAL_FIELDS = ['cadence', 'scope', 'dates', 'price', 'policies'] as const;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

@Injectable()
export class AgreementAmendmentService {
  constructor(
    @InjectModel(AgreementAmendment.name)
    private readonly amendments: Model<AgreementAmendmentDocument>,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  private count(name: string, labels: Record<string, string> = {}): void {
    try {
      this.telemetry.count(name, labels);
    } catch {
      // Deliberately swallowed.
    }
  }

  private isPrivileged(actor: AmendmentActor): boolean {
    return actor.role === Role.ADMIN || actor.role === Role.MODERATOR;
  }

  private deny(reason: string, message: string): never {
    this.count('amendment_denied_total', { reason });
    throw new ForbiddenDomainException(message, ErrorCode.MENTOR_ACCESS_DENIED);
  }

  private assertParticipant(
    actor: AmendmentActor,
    participantIds: string[],
    action: string,
  ): void {
    if (this.isPrivileged(actor) || participantIds.includes(actor.id)) return;
    this.deny(`${action}_not_participant`, 'AMENDMENT_ACCESS_DENIED');
  }

  private async load(amendmentId: string): Promise<AgreementAmendmentDocument> {
    const doc = await this.amendments.findById(amendmentId).exec();
    if (!doc) {
      throw new ResourceNotFoundException(
        'AMENDMENT_NOT_FOUND',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    return doc;
  }

  /** Deterministic impact preview; nothing is written on this path. */
  private computeImpact(
    currentTerms: Record<string, unknown>,
    changes: Record<string, unknown>,
    participantIds: string[],
  ): AmendmentImpact {
    const flags: Record<string, boolean> = {};
    for (const field of MATERIAL_FIELDS) {
      flags[`${field}Changed`] =
        Object.prototype.hasOwnProperty.call(changes, field) &&
        JSON.stringify(changes[field]) !== JSON.stringify(currentTerms[field]);
    }

    let priceDelta: number | null = null;
    if (flags.priceChanged) {
      const before = Number(currentTerms.price);
      const after = Number(changes.price);
      if (Number.isFinite(before) && Number.isFinite(after)) {
        priceDelta = after - before;
      }
    }

    const changedFields = MATERIAL_FIELDS.filter(
      (field) => flags[`${field}Changed`],
    );
    const requiresReapproval = changedFields.length > 0;

    return {
      cadenceChanged: flags.cadenceChanged,
      scopeChanged: flags.scopeChanged,
      datesChanged: flags.datesChanged,
      priceChanged: flags.priceChanged,
      policiesChanged: flags.policiesChanged,
      priceDelta,
      affectedParticipants: participantIds.length,
      requiresReapproval,
      summary: requiresReapproval
        ? `Material change to: ${changedFields.join(', ')}`
        : 'No material term changed',
    };
  }

  private allApproved(doc: AgreementAmendmentDocument): boolean {
    const approved = new Set(doc.approvals.map((entry) => entry.approverId));
    return doc.requiredApprovers.every((id) => approved.has(id));
  }

  /** Preview impact for a change without creating an amendment. */
  preview(actor: AmendmentActor, dto: PreviewAmendmentDto) {
    this.assertParticipant(actor, dto.participantIds, 'preview');
    const impact = this.computeImpact(dto.currentTerms, dto.changes, dto.participantIds);
    this.count('amendment_previewed_total');
    return {
      impact,
      termsHash: computeAmendmentHash(dto.currentTerms, dto.changes),
      requiresReapproval: impact.requiresReapproval,
    };
  }

  /**
   * Propose a versioned amendment. Old terms keep governing because the
   * amendment is inert (PROPOSED) until it is approved and activated. A retry
   * with the same version and identical resulting terms returns the original
   * document without creating a duplicate.
   */
  async propose(
    actor: AmendmentActor,
    agreementId: string,
    dto: ProposeAmendmentDto,
  ): Promise<AgreementAmendmentDocument> {
    this.assertParticipant(actor, dto.participantIds, 'propose');
    if (dto.version <= dto.supersedes) {
      throw new ForbiddenDomainException(
        'AMENDMENT_VERSION_INVALID',
        ErrorCode.VAL_INVALID_INPUT,
      );
    }

    const impact = this.computeImpact(dto.currentTerms, dto.changes, dto.participantIds);
    const termsHash = computeAmendmentHash(dto.currentTerms, dto.changes);

    const existing = await this.amendments
      .findOne({ agreementId, version: dto.version })
      .exec();
    if (existing) {
      if (existing.termsHash === termsHash) {
        this.count('amendment_replays_total');
        return existing;
      }
      throw new ForbiddenDomainException(
        'AMENDMENT_VERSION_CONFLICT',
        ErrorCode.BIZ_DUPLICATE_REQUEST,
      );
    }

    // Material changes need every other participant's approval; immaterial
    // changes can be activated directly by a coordinator.
    const requiredApprovers = impact.requiresReapproval
      ? dto.participantIds.filter((id) => id !== actor.id)
      : [];

    try {
      const created = await this.amendments.create({
        agreementId,
        version: dto.version,
        supersedes: dto.supersedes,
        proposedBy: actor.id,
        participantIds: [...dto.participantIds],
        changes: dto.changes,
        termsHash,
        impact,
        requiredApprovers,
        approvals: [],
        status: AmendmentStatus.PROPOSED,
        rejectedBy: null,
        rejectionReason: null,
        rejectedAt: null,
        activatedAt: null,
      });
      this.count('amendment_proposed_total');
      return created;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      this.count('amendment_replays_total');
      const winner = await this.amendments
        .findOne({ agreementId, version: dto.version })
        .exec();
      if (!winner) throw error;
      return winner;
    }
  }

  /**
   * Append one approval. A conditional push prevents double-approval; once
   * every configured approver has signed, the amendment becomes APPROVED.
   */
  async approve(
    actor: AmendmentActor,
    amendmentId: string,
    _dto: ApproveAmendmentDto,
  ): Promise<AgreementAmendmentDocument> {
    const doc = await this.load(amendmentId);
    if (doc.status !== AmendmentStatus.PROPOSED) {
      throw new ForbiddenDomainException(
        'AMENDMENT_NOT_PROPOSED',
        ErrorCode.BIZ_MENTORSHIP_TRANSITION_FORBIDDEN,
      );
    }

    const isApprover = doc.requiredApprovers.includes(actor.id);
    if (!this.isPrivileged(actor) && !isApprover) {
      this.deny('approve_not_approver', 'AMENDMENT_APPROVAL_DENIED');
    }
    // Separation of duties: a proposer cannot self-approve their own change.
    if (!this.isPrivileged(actor) && doc.proposedBy === actor.id) {
      this.deny('approve_self', 'AMENDMENT_SELF_APPROVAL_DENIED');
    }

    if (doc.approvals.some((entry) => entry.approverId === actor.id)) {
      this.count('amendment_approval_replays_total');
      return doc;
    }

    const updated = await this.amendments
      .findOneAndUpdate(
        {
          _id: amendmentId,
          status: AmendmentStatus.PROPOSED,
          'approvals.approverId': { $ne: actor.id },
        },
        {
          $push: {
            approvals: { approverId: actor.id, approvedAt: new Date() },
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      const current = await this.load(amendmentId);
      if (current.approvals.some((entry) => entry.approverId === actor.id)) {
        this.count('amendment_approval_replays_total');
        return current;
      }
      throw new ForbiddenDomainException(
        'AMENDMENT_APPROVAL_CONFLICT',
        ErrorCode.BIZ_MENTORSHIP_LIFECYCLE_CONFLICT,
      );
    }

    if (this.allApproved(updated)) {
      await this.amendments
        .updateOne(
          { _id: amendmentId, status: AmendmentStatus.PROPOSED },
          { $set: { status: AmendmentStatus.APPROVED } },
        )
        .exec();
      this.count('amendment_approved_total');
    } else {
      this.count('amendment_approval_recorded_total');
    }
    return this.load(amendmentId);
  }

  /** Reject a proposed amendment. The underlying agreement is untouched. */
  async reject(
    actor: AmendmentActor,
    amendmentId: string,
    dto: RejectAmendmentDto,
  ): Promise<AgreementAmendmentDocument> {
    const doc = await this.load(amendmentId);
    if (doc.status !== AmendmentStatus.PROPOSED) {
      throw new ForbiddenDomainException(
        'AMENDMENT_NOT_PROPOSED',
        ErrorCode.BIZ_MENTORSHIP_TRANSITION_FORBIDDEN,
      );
    }
    if (!this.isPrivileged(actor) && !doc.requiredApprovers.includes(actor.id)) {
      this.deny('reject_not_approver', 'AMENDMENT_REJECT_DENIED');
    }

    const updated = await this.amendments
      .findOneAndUpdate(
        { _id: amendmentId, status: AmendmentStatus.PROPOSED },
        {
          $set: {
            status: AmendmentStatus.REJECTED,
            rejectedBy: actor.id,
            rejectionReason: dto.reason,
            rejectedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new ForbiddenDomainException(
        'AMENDMENT_REJECT_CONFLICT',
        ErrorCode.BIZ_MENTORSHIP_LIFECYCLE_CONFLICT,
      );
    }
    this.count('amendment_rejected_total');
    return updated;
  }

  /**
   * Activate an approved amendment. This is the only point at which new terms
   * take effect — until then the superseded version governs.
   */
  async activate(
    actor: AmendmentActor,
    amendmentId: string,
    _dto: ActivateAmendmentDto,
  ): Promise<AgreementAmendmentDocument> {
    const doc = await this.load(amendmentId);
    if (doc.status !== AmendmentStatus.APPROVED) {
      throw new ForbiddenDomainException(
        'AGREEMENT_NOT_ACTIVE',
        ErrorCode.BIZ_MENTORSHIP_TRANSITION_FORBIDDEN,
      );
    }
    if (
      !this.isPrivileged(actor) &&
      !doc.requiredApprovers.includes(actor.id) &&
      doc.proposedBy !== actor.id
    ) {
      this.deny('activate_not_allowed', 'AMENDMENT_ACTIVATION_DENIED');
    }
    if (!this.allApproved(doc)) {
      throw new ForbiddenDomainException(
        'AMENDMENT_APPROVALS_INCOMPLETE',
        ErrorCode.BIZ_MENTORSHIP_OVERRIDE_REQUIRED,
      );
    }

    const updated = await this.amendments
      .findOneAndUpdate(
        { _id: amendmentId, status: AmendmentStatus.APPROVED },
        { $set: { status: AmendmentStatus.ACTIVE, activatedAt: new Date() } },
        { new: true },
      )
      .exec();
    if (!updated) {
      throw new ForbiddenDomainException(
        'AMENDMENT_ACTIVATION_CONFLICT',
        ErrorCode.BIZ_MENTORSHIP_LIFECYCLE_CONFLICT,
      );
    }
    this.count('amendment_activated_total');
    return updated;
  }

  /** The active amendment (highest version) that currently governs an agreement. */
  async activeFor(agreementId: string): Promise<AgreementAmendmentDocument | null> {
    return this.amendments
      .findOne({ agreementId, status: AmendmentStatus.ACTIVE })
      .sort({ version: -1 })
      .exec();
  }

  /** Full immutable history for an agreement, newest version first. */
  async history(agreementId: string): Promise<AgreementAmendmentDocument[]> {
    return this.amendments.find({ agreementId }).sort({ version: -1 }).exec();
  }
}
