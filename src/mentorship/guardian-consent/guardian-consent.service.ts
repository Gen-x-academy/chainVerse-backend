import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { MentorshipUser } from '../shared/mentorship-context';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { AgePolicyService } from './age-policy.service';
import { GuardianConsentPolicy } from './guardian-consent.policy';
import {
  AcceptGuardianConsentDto,
  EvaluateAgePolicyDto,
  InviteGuardianDto,
  ReConsentGuardianDto,
  RevokeGuardianConsentDto,
} from './dto/guardian-consent.dto';
import {
  ConsentScope,
  GuardianConsentDocument,
  GuardianConsentRecord,
  GuardianConsentStatus,
} from './schemas/guardian-consent.schema';

/** Response shape shared with participants — no private guardian data. */
export interface GuardianConsentSnapshot {
  id: string;
  minorId: string;
  engagementId: string;
  programId: string;
  status: GuardianConsentStatus;
  scopes: ConsentScope[];
  materialChangeVersionHash: string;
  agePolicyVersion: number;
  sequence: number;
  expiresAt: Date | null;
  grantedAt: Date | null;
  revokedAt: Date | null;
}

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class GuardianConsentService {
  constructor(
    @InjectModel(GuardianConsentRecord.name)
    private readonly records: Model<GuardianConsentDocument>,
    private readonly agePolicy: AgePolicyService,
    private readonly policy: GuardianConsentPolicy,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  evaluate(user: MentorshipUser, dto: EvaluateAgePolicyDto) {
    if (dto.minorId !== user.id && !this.policy.isCoordinator(user)) {
      this.policy.deny('evaluate_other_age_policy', 'GUARDIAN_INSPECT_DENIED');
    }
    const decision = this.agePolicy.evaluate(dto.dateOfBirth, dto.jurisdiction);
    this.count('evaluate', 'ok');
    return decision;
  }

  async invite(user: MentorshipUser, dto: InviteGuardianDto) {
    this.policy.assertCanInvite(user, dto.minorId);

    const decision = this.agePolicy.evaluate(dto.dateOfBirth, dto.jurisdiction);
    if (!decision.guardianRequired) {
      this.count('invite', 'not_required');
      throw new BadRequestException('GUARDIAN_CONSENT_NOT_REQUIRED');
    }

    const expiresAt = new Date(dto.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      this.count('invite', 'invalid_expiry');
      throw new BadRequestException('GUARDIAN_CONSENT_INVALID_EXPIRY');
    }

    const idempotencyKeyHash = sha256(
      `invite:${dto.minorId}:${dto.engagementId}:${dto.idempotencyKey}`,
    );
    const existing = await this.records
      .findOne({ idempotencyKeyHash })
      .exec();
    if (existing) {
      this.count('invite', 'replayed');
      return this.inviteResult(existing);
    }

    const materialHash = this.materialHash(
      dto.engagementId,
      dto.programId,
      dto.scopes,
      dto.termsVersion,
    );
    const latest = await this.latest(dto.minorId, dto.engagementId);
    const inviteToken = sha256(`invite-token:${idempotencyKeyHash}`);
    const record = await this.append({
      minorId: dto.minorId,
      engagementId: dto.engagementId,
      programId: dto.programId,
      status: GuardianConsentStatus.INVITED,
      inviteTokenHash: sha256(inviteToken),
      guardianContactHash: sha256(dto.guardianContact.trim().toLowerCase()),
      relationship: dto.relationship,
      verifiedRelationshipRef: dto.verifiedRelationshipRef,
      scopes: [...dto.scopes],
      materialChangeVersionHash: materialHash,
      agePolicyVersion: decision.policyVersion,
      sequence: (latest?.sequence ?? 0) + 1,
      idempotencyKeyHash,
      supersedesHash: latest ? sha256(latest.inviteTokenHash) : null,
      decidedBy: user.id,
      expiresAt,
      grantedAt: null,
      revokedAt: null,
      reasonHash: null,
    });

    this.count('invite', 'created');
    return this.inviteResult(record);
  }

  async accept(user: MentorshipUser, dto: AcceptGuardianConsentDto) {
    const inviteTokenHash = sha256(dto.inviteToken);
    const invite = await this.records.findOne({ inviteTokenHash }).exec();
    if (!invite) {
      this.count('accept', 'not_found');
      throw new NotFoundException('GUARDIAN_INVITE_NOT_FOUND');
    }

    this.policy.assertGuardianActor(user, invite.minorId);
    if (invite.status !== GuardianConsentStatus.INVITED) {
      this.count('accept', 'not_invited');
      throw new ConflictException('GUARDIAN_INVITE_NOT_ACTIVE');
    }
    if (!invite.expiresAt || invite.expiresAt.getTime() <= Date.now()) {
      this.count('accept', 'expired');
      throw new ConflictException('GUARDIAN_INVITE_EXPIRED');
    }
    const latest = await this.latest(invite.minorId, invite.engagementId);
    if (!latest || latest.sequence !== invite.sequence) {
      this.count('accept', 'superseded');
      throw new ConflictException('GUARDIAN_CONSENT_SUPERSEDED');
    }
    if (
      invite.verifiedRelationshipRef.trim().toLowerCase() !==
      dto.verifiedRelationshipRef.trim().toLowerCase()
    ) {
      this.count('accept', 'relationship_unverified');
      throw new ForbiddenException('GUARDIAN_RELATIONSHIP_UNVERIFIED');
    }

    const idempotencyKeyHash = sha256(
      `accept:${inviteTokenHash}:${dto.idempotencyKey}`,
    );
    const existing = await this.records
      .findOne({ idempotencyKeyHash })
      .exec();
    if (existing) {
      this.count('accept', 'replayed');
      return this.toSnapshot(existing);
    }

    const granted = await this.append({
      minorId: invite.minorId,
      engagementId: invite.engagementId,
      programId: invite.programId,
      status: GuardianConsentStatus.GRANTED,
      inviteTokenHash: sha256(`granted:${inviteTokenHash}`),
      guardianContactHash: invite.guardianContactHash,
      relationship: invite.relationship,
      verifiedRelationshipRef: invite.verifiedRelationshipRef,
      scopes: [...invite.scopes],
      materialChangeVersionHash: invite.materialChangeVersionHash,
      agePolicyVersion: invite.agePolicyVersion,
      sequence: invite.sequence + 1,
      idempotencyKeyHash,
      supersedesHash: sha256(invite.inviteTokenHash),
      decidedBy: user.id,
      expiresAt: invite.expiresAt,
      grantedAt: new Date(),
      revokedAt: null,
      reasonHash: null,
    });

    this.count('accept', 'granted');
    return this.toSnapshot(granted);
  }

  async revoke(user: MentorshipUser, dto: RevokeGuardianConsentDto) {
    const idempotencyKeyHash = sha256(
      `revoke:${dto.minorId}:${dto.engagementId}:${dto.idempotencyKey}`,
    );
    const existing = await this.records
      .findOne({ idempotencyKeyHash })
      .exec();
    if (existing) {
      this.count('revoke', 'replayed');
      return this.toSnapshot(existing);
    }

    const current = await this.latest(dto.minorId, dto.engagementId);
    if (!current) {
      this.count('revoke', 'not_found');
      throw new NotFoundException('GUARDIAN_CONSENT_NOT_FOUND');
    }
    this.policy.assertGuardianActor(user, current.minorId);
    if (current.status !== GuardianConsentStatus.GRANTED) {
      this.count('revoke', 'not_active');
      throw new ConflictException('GUARDIAN_CONSENT_NOT_ACTIVE');
    }

    const revoked = await this.append({
      minorId: current.minorId,
      engagementId: current.engagementId,
      programId: current.programId,
      status: GuardianConsentStatus.REVOKED,
      inviteTokenHash: sha256(`revoked:${current.inviteTokenHash}`),
      guardianContactHash: current.guardianContactHash,
      relationship: current.relationship,
      verifiedRelationshipRef: current.verifiedRelationshipRef,
      scopes: [...current.scopes],
      materialChangeVersionHash: current.materialChangeVersionHash,
      agePolicyVersion: current.agePolicyVersion,
      sequence: current.sequence + 1,
      idempotencyKeyHash,
      supersedesHash: sha256(current.inviteTokenHash),
      decidedBy: user.id,
      expiresAt: current.expiresAt,
      grantedAt: current.grantedAt,
      revokedAt: new Date(),
      reasonHash: sha256(dto.reason ?? ''),
    });

    this.count('revoke', 'revoked');
    return this.toSnapshot(revoked);
  }

  async reConsent(user: MentorshipUser, dto: ReConsentGuardianDto) {
    this.policy.assertCanInvite(user, dto.minorId);

    const idempotencyKeyHash = sha256(
      `reconsent:${dto.minorId}:${dto.engagementId}:${dto.idempotencyKey}`,
    );
    const existing = await this.records
      .findOne({ idempotencyKeyHash })
      .exec();
    if (existing) {
      this.count('reconsent', 'replayed');
      return this.inviteResult(existing);
    }

    const current = await this.latest(dto.minorId, dto.engagementId);
    if (!current) {
      this.count('reconsent', 'not_found');
      throw new NotFoundException('GUARDIAN_CONSENT_NOT_FOUND');
    }
    const materialHash = this.materialHash(
      dto.engagementId,
      dto.programId,
      dto.scopes,
      dto.termsVersion,
    );
    if (materialHash === current.materialChangeVersionHash) {
      this.count('reconsent', 'not_required');
      throw new BadRequestException('GUARDIAN_RECONSENT_NOT_REQUIRED');
    }
    const expiresAt = new Date(dto.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      this.count('reconsent', 'invalid_expiry');
      throw new BadRequestException('GUARDIAN_CONSENT_INVALID_EXPIRY');
    }

    const inviteToken = sha256(`invite-token:${idempotencyKeyHash}`);
    const record = await this.append({
      minorId: dto.minorId,
      engagementId: dto.engagementId,
      programId: dto.programId,
      status: GuardianConsentStatus.INVITED,
      inviteTokenHash: sha256(inviteToken),
      guardianContactHash: sha256(dto.guardianContact.trim().toLowerCase()),
      relationship: dto.relationship,
      verifiedRelationshipRef: dto.verifiedRelationshipRef,
      scopes: [...dto.scopes],
      materialChangeVersionHash: materialHash,
      agePolicyVersion: current.agePolicyVersion,
      sequence: current.sequence + 1,
      idempotencyKeyHash,
      supersedesHash: sha256(current.inviteTokenHash),
      decidedBy: user.id,
      expiresAt,
      grantedAt: null,
      revokedAt: null,
      reasonHash: null,
    });

    this.count('reconsent', 'invited');
    return this.inviteResult(record);
  }

  /**
   * Integration hook for other mentorship flows: throws unless there is an
   * unexpired, unrevoked grant covering every required scope and bound to the
   * supplied material-change hash.
   */
  async assertActive(
    minorId: string,
    engagementId: string,
    requiredScopes: ConsentScope[] = [],
    expectedMaterialHash?: string,
  ): Promise<GuardianConsentDocument> {
    const current = await this.latest(minorId, engagementId);
    if (!current) {
      this.count('assert', 'missing');
      throw new ForbiddenException('GUARDIAN_CONSENT_REQUIRED');
    }
    if (current.status === GuardianConsentStatus.REVOKED) {
      this.count('assert', 'revoked');
      throw new ForbiddenException('GUARDIAN_CONSENT_REVOKED');
    }
    if (current.status !== GuardianConsentStatus.GRANTED) {
      this.count('assert', 'pending');
      throw new ForbiddenException('GUARDIAN_CONSENT_PENDING');
    }
    if (!current.expiresAt || current.expiresAt.getTime() <= Date.now()) {
      this.count('assert', 'expired');
      throw new ForbiddenException('GUARDIAN_CONSENT_EXPIRED');
    }
    if (
      expectedMaterialHash &&
      current.materialChangeVersionHash !== expectedMaterialHash
    ) {
      this.count('assert', 'stale');
      throw new ConflictException('GUARDIAN_CONSENT_STALE');
    }
    const missing = requiredScopes.filter((s) => !current.scopes.includes(s));
    if (missing.length > 0) {
      this.count('assert', 'scope_missing');
      throw new ForbiddenException('GUARDIAN_CONSENT_SCOPE_MISSING');
    }
    this.count('assert', 'ok');
    return current;
  }

  async snapshot(user: MentorshipUser, engagementId: string, minorId?: string) {
    const target = minorId ?? user.id;
    this.assertCanRead(user, target);
    const current = await this.latest(target, engagementId);
    if (!current) {
      throw new NotFoundException('GUARDIAN_CONSENT_NOT_FOUND');
    }
    return this.policy.isCoordinator(user)
      ? this.toAuditSnapshot(current)
      : this.toSnapshot(current);
  }

  async history(user: MentorshipUser, engagementId: string, minorId?: string) {
    const target = minorId ?? user.id;
    this.assertCanRead(user, target);
    const rows = await this.records
      .find({ minorId: target, engagementId })
      .sort({ sequence: 1 })
      .exec();
    return rows.map((row) =>
      this.policy.isCoordinator(user)
        ? this.toAuditSnapshot(row)
        : this.toSnapshot(row),
    );
  }

  private assertCanRead(user: MentorshipUser, minorId: string): void {
    if (minorId !== user.id && !this.policy.isCoordinator(user)) {
      this.policy.deny('read_other_guardian_consent', 'GUARDIAN_INSPECT_DENIED');
    }
  }

  private async latest(
    minorId: string,
    engagementId: string,
  ): Promise<GuardianConsentDocument | null> {
    return this.records
      .findOne({ minorId, engagementId })
      .sort({ sequence: -1 })
      .exec();
  }

  private async append(
    data: Partial<GuardianConsentRecord>,
  ): Promise<GuardianConsentDocument> {
    try {
      return await this.records.create(data);
    } catch (error) {
      if ((error as { code?: number }).code === 11000 && data.idempotencyKeyHash) {
        const existing = await this.records
          .findOne({ idempotencyKeyHash: data.idempotencyKeyHash })
          .exec();
        if (existing) return existing;
      }
      throw error;
    }
  }

  private materialHash(
    engagementId: string,
    programId: string,
    scopes: ConsentScope[],
    termsVersion: number,
  ): string {
    return sha256(
      JSON.stringify({
        engagementId,
        programId,
        scopes: [...scopes].sort(),
        termsVersion,
      }),
    );
  }

  private inviteResult(record: GuardianConsentDocument) {
    return {
      snapshot: this.toSnapshot(record),
      inviteToken: sha256(`invite-token:${record.idempotencyKeyHash}`),
    };
  }

  /** Participants get everything except guardian contact/token/reason data. */
  private toSnapshot(record: GuardianConsentDocument): GuardianConsentSnapshot {
    return {
      id: String(record._id),
      minorId: record.minorId,
      engagementId: record.engagementId,
      programId: record.programId,
      status: record.status,
      scopes: [...record.scopes],
      materialChangeVersionHash: record.materialChangeVersionHash,
      agePolicyVersion: record.agePolicyVersion,
      sequence: record.sequence,
      expiresAt: record.expiresAt ?? null,
      grantedAt: record.grantedAt ?? null,
      revokedAt: record.revokedAt ?? null,
    };
  }

  /** Coordinators may see the verification reference and decision actor only. */
  private toAuditSnapshot(record: GuardianConsentDocument) {
    return {
      ...this.toSnapshot(record),
      relationship: record.relationship,
      verifiedRelationshipRef: record.verifiedRelationshipRef,
      decidedBy: record.decidedBy ?? null,
    };
  }

  private count(event: string, outcome: string): void {
    try {
      this.telemetry.count('mentorship_guardian_consent_events_total', {
        event,
        outcome,
      });
    } catch {
      // Telemetry must never break a consent decision.
    }
  }
}
