import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { MentorshipUser } from '../shared/mentorship-context';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { AgreementPolicy } from './agreement.policy';
import {
  AddApprovalDto,
  CreateAgreementDto,
  EndAgreementDto,
  AgreementTermsDto,
} from './dto/agreement.dto';
import {
  Agreement,
  AgreementApproval,
  AgreementDocument,
  AgreementStatus,
  ApprovalRole,
} from './schemas/agreement.schema';

export interface AgreementSnapshot {
  id: string;
  programId: string;
  mentorId: string;
  menteeId: string;
  proposalId: string | null;
  terms: Agreement['terms'];
  termsVersion: number;
  termsHash: string;
  status: AgreementStatus;
  approvals: Array<{
    role: ApprovalRole;
    termsVersion: number;
    acceptedAt: Date;
  }>;
  activatedAt: Date | null;
  endedAt: Date | null;
}

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

@Injectable()
export class AgreementService {
  constructor(
    @InjectModel(Agreement.name)
    private readonly agreements: Model<AgreementDocument>,
    private readonly policy: AgreementPolicy,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  async create(user: MentorshipUser, dto: CreateAgreementDto) {
    this.policy.assertCanCreate(user, dto.mentorId, dto.menteeId);

    const missing = this.missingTerms(dto.terms);
    if (missing.length > 0) {
      this.count('create', 'incomplete_terms');
      throw new BadRequestException('AGREEMENT_TERMS_INCOMPLETE');
    }

    const clientKey = sha256(
      `${dto.idempotencyKey}:${dto.programId}:${dto.mentorId}:${dto.menteeId}`,
    );
    const existing = await this.agreements.findOne({ clientKey }).exec();
    if (existing) {
      this.count('create', 'replayed');
      return this.toSnapshot(existing);
    }

    const requiredApprovals =
      dto.requiredApprovals && dto.requiredApprovals.length > 0
        ? [...dto.requiredApprovals]
        : [ApprovalRole.MENTOR, ApprovalRole.MENTEE];
    const agreement = await this.agreements.create({
      programId: dto.programId,
      mentorId: dto.mentorId,
      menteeId: dto.menteeId,
      proposalId: dto.proposalId ?? null,
      terms: this.normaliseTerms(dto.terms),
      termsVersion: 1,
      termsHash: this.termsHash(dto.terms),
      status: AgreementStatus.DRAFT,
      requiredApprovals,
      approvals: [],
      version: 1,
      clientKey,
      privateNote: this.policy.isCoordinator(user) ? dto.privateNote ?? null : null,
      activatedAt: null,
      endedAt: null,
      endReasonHash: null,
    });

    this.count('create', 'draft_created');
    return this.toSnapshot(agreement);
  }

  async addApproval(
    user: MentorshipUser,
    agreementId: string,
    dto: AddApprovalDto,
  ) {
    const agreement = await this.findById(agreementId);
    this.assertDraft(agreement);
    if (!agreement.requiredApprovals.includes(dto.role)) {
      this.count('approve', 'role_not_required');
      throw new BadRequestException('AGREEMENT_ROLE_NOT_REQUIRED');
    }
    this.policy.assertCanApprove(user, agreement, dto.role);

    if (
      dto.termsVersion !== agreement.termsVersion ||
      dto.termsHash !== agreement.termsHash
    ) {
      this.count('approve', 'stale_terms');
      throw new ConflictException('AGREEMENT_TERMS_STALE');
    }

    const alreadyApproved = agreement.approvals.some(
      (a) =>
        a.userId === user.id &&
        a.role === dto.role &&
        a.termsVersion === dto.termsVersion &&
        a.termsHash === dto.termsHash,
    );
    if (alreadyApproved) {
      this.count('approve', 'replayed');
      return this.toSnapshot(agreement);
    }

    const approval: AgreementApproval = {
      role: dto.role,
      userId: user.id,
      termsVersion: dto.termsVersion,
      termsHash: dto.termsHash,
      acceptedAt: new Date(),
    };
    const updated = await this.agreements
      .findOneAndUpdate(
        {
          _id: agreementId,
          status: AgreementStatus.DRAFT,
          version: agreement.version,
          'approvals.userId': { $ne: user.id },
        },
        { $push: { approvals: approval }, $inc: { version: 1 } },
        { new: true },
      )
      .exec();
    if (!updated) {
      this.count('approve', 'conflict');
      throw new ConflictException('AGREEMENT_VERSION_CONFLICT');
    }

    this.count('approve', 'recorded');
    return this.toSnapshot(updated);
  }

  async activate(user: MentorshipUser, agreementId: string) {
    const agreement = await this.findById(agreementId);
    if (agreement.status === AgreementStatus.ACTIVE) {
      this.count('activate', 'replayed');
      return this.toSnapshot(agreement);
    }
    if (agreement.status === AgreementStatus.ENDED) {
      this.count('activate', 'ended');
      throw new ConflictException('AGREEMENT_ENDED');
    }
    this.assertReadActor(user, agreement);

    const outstanding = agreement.requiredApprovals.filter(
      (role) =>
        !agreement.approvals.some(
          (a) =>
            a.role === role &&
            a.termsVersion === agreement.termsVersion &&
            a.termsHash === agreement.termsHash,
        ),
    );
    if (outstanding.length > 0) {
      this.count('activate', 'approvals_incomplete');
      throw new ConflictException('AGREEMENT_APPROVALS_INCOMPLETE');
    }

    const updated = await this.agreements
      .findOneAndUpdate(
        {
          _id: agreementId,
          status: AgreementStatus.DRAFT,
          version: agreement.version,
        },
        {
          $set: { status: AgreementStatus.ACTIVE, activatedAt: new Date() },
          $inc: { version: 1 },
        },
        { new: true },
      )
      .exec();
    if (!updated) {
      this.count('activate', 'conflict');
      throw new ConflictException('AGREEMENT_VERSION_CONFLICT');
    }

    this.count('activate', 'activated');
    return this.toSnapshot(updated);
  }

  async end(user: MentorshipUser, agreementId: string, dto: EndAgreementDto) {
    const agreement = await this.findById(agreementId);
    if (agreement.status !== AgreementStatus.ACTIVE) {
      this.count('end', 'not_active');
      throw new ConflictException('AGREEMENT_NOT_ACTIVE');
    }
    this.assertReadActor(user, agreement);

    const reasonHash = sha256(
      `${dto.reason}:${dto.idempotencyKey ?? ''}`,
    );
    if (agreement.endReasonHash === reasonHash) {
      this.count('end', 'replayed');
      return this.toSnapshot(agreement);
    }

    const updated = await this.agreements
      .findOneAndUpdate(
        {
          _id: agreementId,
          status: AgreementStatus.ACTIVE,
          version: agreement.version,
        },
        {
          $set: {
            status: AgreementStatus.ENDED,
            endedAt: new Date(),
            endReasonHash: reasonHash,
          },
          $inc: { version: 1 },
        },
        { new: true },
      )
      .exec();
    if (!updated) {
      this.count('end', 'conflict');
      throw new ConflictException('AGREEMENT_VERSION_CONFLICT');
    }

    this.count('end', 'ended');
    return this.toSnapshot(updated);
  }

  async snapshot(user: MentorshipUser, agreementId: string) {
    const agreement = await this.findById(agreementId);
    this.assertReadActor(user, agreement);
    return this.toSnapshot(agreement);
  }

  /** Full record for coordinators only — includes the private note. */
  async inspect(user: MentorshipUser, agreementId: string) {
    this.policy.assertCanInspect(user);
    return this.findById(agreementId);
  }

  async listForProgram(user: MentorshipUser, programId: string) {
    this.policy.assertCanInspect(user);
    return this.agreements.find({ programId }).sort({ createdAt: -1 }).exec();
  }

  private assertReadActor(user: MentorshipUser, agreement: AgreementDocument) {
    if (!this.policy.isParticipant(user, agreement) && !this.policy.isCoordinator(user)) {
      this.policy.deny('read_agreement', 'AGREEMENT_INSPECT_DENIED');
    }
  }

  private assertDraft(agreement: AgreementDocument) {
    if (agreement.status !== AgreementStatus.DRAFT) {
      this.count('approve', 'immutable');
      throw new ConflictException('AGREEMENT_IMMUTABLE');
    }
  }

  private async findById(id: string): Promise<AgreementDocument> {
    const agreement = await this.agreements.findById(id).exec();
    if (!agreement) throw new NotFoundException('AGREEMENT_NOT_FOUND');
    return agreement;
  }

  private missingTerms(terms: AgreementTermsDto): string[] {
    const missing: string[] = [];
    if (!terms.goals || terms.goals.length === 0 || terms.goals.some((g) => !g?.trim()))
      missing.push('goals');
    if (!terms.scope?.trim()) missing.push('scope');
    if (!Number.isInteger(terms.durationWeeks) || terms.durationWeeks < 1)
      missing.push('durationWeeks');
    if (!terms.cadence?.trim()) missing.push('cadence');
    if (!Number.isInteger(terms.sessionsPerMonth) || terms.sessionsPerMonth < 1)
      missing.push('sessionsPerMonth');
    if (
      !Number.isInteger(terms.sessionLengthMinutes) ||
      terms.sessionLengthMinutes < 15
    )
      missing.push('sessionLengthMinutes');
    if (!PRICE_PATTERN.test(terms.pricePerSession ?? ''))
      missing.push('pricePerSession');
    if (!CURRENCY_PATTERN.test(terms.currency ?? '')) missing.push('currency');
    if (!terms.cancellationPolicy?.trim()) missing.push('cancellationPolicy');
    if (!terms.conductPolicy?.trim()) missing.push('conductPolicy');
    return missing;
  }

  private normaliseTerms(terms: AgreementTermsDto): Agreement['terms'] {
    return {
      goals: terms.goals.map((g) => g.trim()),
      scope: terms.scope.trim(),
      durationWeeks: terms.durationWeeks,
      cadence: terms.cadence.trim(),
      sessionsPerMonth: terms.sessionsPerMonth,
      sessionLengthMinutes: terms.sessionLengthMinutes,
      pricePerSession: terms.pricePerSession,
      currency: terms.currency,
      cancellationPolicy: terms.cancellationPolicy.trim(),
      conductPolicy: terms.conductPolicy.trim(),
      evidenceRefs: (terms.evidenceRefs ?? []).map((ref) => ref.trim()),
    };
  }

  /** SHA-256 over canonicalised terms; any change produces a new hash. */
  private termsHash(terms: AgreementTermsDto): string {
    const canonical = {
      cadence: terms.cadence.trim(),
      cancellationPolicy: terms.cancellationPolicy.trim(),
      conductPolicy: terms.conductPolicy.trim(),
      currency: terms.currency,
      durationWeeks: terms.durationWeeks,
      evidenceRefs: [...(terms.evidenceRefs ?? [])].sort(),
      goals: [...terms.goals].map((g) => g.trim()).sort(),
      pricePerSession: terms.pricePerSession,
      scope: terms.scope.trim(),
      sessionLengthMinutes: terms.sessionLengthMinutes,
      sessionsPerMonth: terms.sessionsPerMonth,
    };
    return sha256(JSON.stringify(canonical));
  }

  /** Participant-readable: no coordinator note and no approval user ids. */
  private toSnapshot(agreement: AgreementDocument): AgreementSnapshot {
    return {
      id: String(agreement._id),
      programId: agreement.programId,
      mentorId: agreement.mentorId,
      menteeId: agreement.menteeId,
      proposalId: agreement.proposalId ?? null,
      terms: agreement.terms,
      termsVersion: agreement.termsVersion,
      termsHash: agreement.termsHash,
      status: agreement.status,
      approvals: agreement.approvals.map((a) => ({
        role: a.role,
        termsVersion: a.termsVersion,
        acceptedAt: a.acceptedAt,
      })),
      activatedAt: agreement.activatedAt ?? null,
      endedAt: agreement.endedAt ?? null,
    };
  }

  private count(event: string, outcome: string): void {
    try {
      this.telemetry.count('mentorship_agreement_events_total', { event, outcome });
    } catch {
      // Telemetry must never break an agreement transition.
    }
  }
}
