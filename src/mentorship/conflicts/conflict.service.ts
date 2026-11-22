import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { ErrorCode, ResourceNotFoundException, ValidationDomainException } from '../../common/errors';
import { MentorshipRequestContext } from '../shared/mentorship-context';
import { conflict, staleVersion } from '../shared/mentorship-errors';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { ConflictAccessPolicy } from './conflict-access.policy';
import {
  CheckOutcome,
  CONFLICT_RULES_VERSION,
  ConflictSeverity,
  WaiverStatus,
} from './conflict.constants';
import { DecideWaiverDto, RequestWaiverDto, RunConflictCheckDto } from './dto/conflict.dto';
import { evaluateConflicts } from './domain/conflict.evaluator';
import {
  ConflictCheck,
  ConflictCheckDocument,
} from './schemas/conflict-check.schema';
import {
  ConflictWaiver,
  ConflictWaiverDocument,
} from './schemas/conflict-waiver.schema';

type CheckRecord = Pick<
  ConflictCheck,
  | 'proposalId'
  | 'mentorId'
  | 'menteeId'
  | 'programId'
  | 'rulesVersion'
  | 'checkVersion'
  | 'inputHash'
  | 'outcome'
  | 'findings'
  | 'privateNotes'
  | 'checkedAt'
  | 'checkedBy'
> & { _id?: unknown; createdAt?: Date };

type WaiverRecord = Pick<
  ConflictWaiver,
  | 'proposalId'
  | 'checkId'
  | 'findingCode'
  | 'version'
  | 'status'
  | 'fingerprint'
  | 'reason'
  | 'decisionNote'
  | 'requestedBy'
  | 'decidedBy'
  | 'decidedAt'
> & { _id?: unknown };

/**
 * Conflict-of-interest checks (MENTOR-040).
 *
 * Evaluations are deterministic and versioned: an identical retry returns the
 * same immutable row, while changed inputs create a new version. Hard findings
 * block activation until a separately approved waiver exists. Private free
 * text is stored apart from public findings and is never returned to other
 * participants.
 */
@Injectable()
export class ConflictService {
  constructor(
    @InjectModel(ConflictCheck.name)
    private readonly checkModel: Model<ConflictCheckDocument>,
    @InjectModel(ConflictWaiver.name)
    private readonly waiverModel: Model<ConflictWaiverDocument>,
    private readonly access: ConflictAccessPolicy,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  async runCheck(ctx: MentorshipRequestContext, dto: RunConflictCheckDto) {
    this.access.assertCanCheck(ctx.user, dto.mentorId, dto.menteeId);
    const staff = this.access.isStaff(ctx.user);
    const evaluation = evaluateConflicts({
      proposalId: dto.proposalId,
      mentorId: dto.mentorId,
      menteeId: dto.menteeId,
      programId: dto.programId ?? null,
      facts: dto.facts,
    });

    const key = {
      proposalId: dto.proposalId,
      inputHash: evaluation.inputHash,
      rulesVersion: CONFLICT_RULES_VERSION,
    };
    const existing = await this.checkModel.findOne(key).lean().exec();
    if (existing) {
      this.safeCount('mentorship_conflict_check_total', { outcome: 'idempotent' });
      return this.checkView(existing as CheckRecord, staff);
    }

    const prior = await this.checkModel
      .findOne({ proposalId: dto.proposalId, rulesVersion: CONFLICT_RULES_VERSION })
      .sort({ checkVersion: -1 })
      .lean()
      .exec();
    const checkVersion = (prior?.checkVersion ?? 0) + 1;

    let created: ConflictCheckDocument;
    try {
      created = await this.checkModel.create({
        ...key,
        mentorId: dto.mentorId,
        menteeId: dto.menteeId,
        programId: dto.programId ?? null,
        checkVersion,
        outcome: evaluation.outcome,
        findings: evaluation.findings,
        privateNotes: evaluation.privateNotes,
        checkedAt: new Date(),
        checkedBy: ctx.user.id,
      });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      const winner = await this.checkModel.findOne(key).lean().exec();
      if (!winner) throw err;
      return this.checkView(winner as CheckRecord, staff);
    }

    this.safeCount('mentorship_conflict_check_total', { outcome: evaluation.outcome });
    this.telemetry.event('mentorship.conflicts.checked', {
      proposalId: dto.proposalId,
      outcome: evaluation.outcome,
      checkVersion,
    });
    return this.checkView(created as CheckRecord, staff);
  }

  /** Explainable result for authorized actors; private text stays with staff. */
  async explain(ctx: MentorshipRequestContext, checkId: string) {
    const check = await this.checkModel.findById(checkId).lean().exec();
    if (!check) {
      throw new ResourceNotFoundException(
        'MENTOR_CONFLICT_CHECK_NOT_FOUND',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    this.access.assertCanExplain(ctx.user, check as CheckRecord);
    const staff = this.access.isStaff(ctx.user);
    this.safeCount('mentorship_conflict_explanation_total', { outcome: check.outcome });
    return {
      ...this.checkView(check as CheckRecord, staff),
      explanation: check.findings.map(
        (f) => `${f.publicMessage} [${f.severity}]`,
      ),
      ...(staff ? {} : { note: 'Private details are available to staff only.' }),
    };
  }

  /**
   * Activation gate: hard findings block until every one has an approved,
   * separately decided waiver. Read-only and safe to call repeatedly.
   */
  async assertActivatable(ctx: MentorshipRequestContext, proposalId: string) {
    const check = await this.checkModel
      .findOne({ proposalId })
      .sort({ checkVersion: -1 })
      .lean()
      .exec();
    if (!check) {
      throw new ResourceNotFoundException(
        'MENTOR_COI_DECLARATION_REQUIRED',
        ErrorCode.MENTOR_COI_DECLARATION_REQUIRED,
      );
    }
    this.access.assertCanExplain(ctx.user, check as CheckRecord);

    const hardCodes = check.findings
      .filter((f) => f.severity === ConflictSeverity.HARD)
      .map((f) => f.code);
    const checkId = String(check._id ?? '');
    if (hardCodes.length === 0) {
      return {
        activatable: true,
        checkId,
        checkVersion: check.checkVersion,
        outcome: check.outcome,
        waivedCodes: [],
      };
    }

    const approved = await this.waiverModel
      .find({ proposalId, findingCode: { $in: hardCodes }, status: WaiverStatus.APPROVED })
      .lean()
      .exec();
    const approvedCodes = new Set(approved.map((w) => w.findingCode));
    const blocking = hardCodes.filter((code) => !approvedCodes.has(code));
    if (blocking.length > 0) {
      throw conflict(
        'MENTOR_CONFLICT_OF_INTEREST: hard conflicts block activation',
        ErrorCode.MENTOR_CONFLICT_OF_INTEREST,
        { checkId, blockingCodes: blocking },
      );
    }
    return {
      activatable: true,
      checkId,
      checkVersion: check.checkVersion,
      outcome: check.outcome,
      waivedCodes: hardCodes,
    };
  }

  /** Request a waiver for one hard finding; repeated requests are idempotent. */
  async requestWaiver(ctx: MentorshipRequestContext, dto: RequestWaiverDto) {
    const check = await this.checkModel.findById(dto.checkId).lean().exec();
    if (!check) {
      throw new ResourceNotFoundException(
        'MENTOR_CONFLICT_CHECK_NOT_FOUND',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    this.access.assertCanExplain(ctx.user, check as CheckRecord);
    const finding = check.findings.find((f) => f.code === dto.findingCode);
    if (!finding || finding.severity !== ConflictSeverity.HARD) {
      throw new ValidationDomainException(
        'VAL_INVALID_INPUT: only hard findings can be waived',
        ErrorCode.VAL_INVALID_INPUT,
        { findingCode: dto.findingCode },
      );
    }

    const fingerprint = this.hash({
      checkId: dto.checkId,
      findingCode: dto.findingCode,
      reason: dto.reason,
      requestedBy: ctx.user.id,
    });
    const existing = await this.waiverModel
      .findOne({
        proposalId: check.proposalId,
        findingCode: dto.findingCode,
        fingerprint,
      })
      .sort({ version: -1 })
      .lean()
      .exec();
    if (existing) {
      this.safeCount('mentorship_conflict_waiver_total', { outcome: 'idempotent' });
      return this.waiverView(existing as WaiverRecord, this.access.isStaff(ctx.user));
    }

    const prior = await this.waiverModel
      .findOne({ proposalId: check.proposalId, findingCode: dto.findingCode })
      .sort({ version: -1 })
      .lean()
      .exec();
    const version = (prior?.version ?? 0) + 1;
    let created: ConflictWaiverDocument;
    try {
      created = await this.waiverModel.create({
        proposalId: check.proposalId,
        checkId: dto.checkId,
        findingCode: dto.findingCode,
        version,
        status: WaiverStatus.REQUESTED,
        fingerprint,
        reason: dto.reason,
        decisionNote: null,
        requestedBy: ctx.user.id,
        decidedBy: null,
        decidedAt: null,
      });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      const winner = await this.waiverModel
        .findOne({ proposalId: check.proposalId, findingCode: dto.findingCode, fingerprint })
        .lean()
        .exec();
      if (!winner) throw err;
      return this.waiverView(winner as WaiverRecord, this.access.isStaff(ctx.user));
    }

    this.safeCount('mentorship_conflict_waiver_total', { outcome: 'requested' });
    return this.waiverView(created as WaiverRecord, this.access.isStaff(ctx.user));
  }

  /** A different staff member approves/rejects by appending a decision version. */
  async decideWaiver(
    ctx: MentorshipRequestContext,
    proposalId: string,
    findingCode: string,
    dto: DecideWaiverDto,
  ) {
    this.access.assertCanDecide(ctx.user);
    const latest = await this.waiverModel
      .findOne({ proposalId, findingCode })
      .sort({ version: -1 })
      .lean()
      .exec();
    if (!latest) {
      throw new ResourceNotFoundException(
        'MENTOR_CONFLICT_WAIVER_NOT_FOUND',
        ErrorCode.RES_NOT_FOUND,
      );
    }
    if (latest.status !== WaiverStatus.REQUESTED) {
      throw conflict(
        'MENTOR_CONFLICT_WAIVER_ALREADY_RESOLVED',
        ErrorCode.BIZ_OVERRIDE_ALREADY_RESOLVED,
        { proposalId, findingCode },
      );
    }
    if (latest.version !== dto.expectedVersion) {
      throw staleVersion('Waiver changed since you loaded it; reload and retry', {
        proposalId,
        findingCode,
        currentVersion: latest.version,
      });
    }
    if (latest.requestedBy === ctx.user.id) {
      throw conflict(
        'MENTOR_CONFLICT_WAIVER_SELF_APPROVAL: a different approver is required',
        ErrorCode.BIZ_SEPARATION_OF_DUTIES,
        { proposalId, findingCode },
      );
    }

    const status = dto.decision === 'approve' ? WaiverStatus.APPROVED : WaiverStatus.REJECTED;
    let created: ConflictWaiverDocument;
    try {
      created = await this.waiverModel.create({
        proposalId,
        checkId: latest.checkId,
        findingCode,
        version: latest.version + 1,
        status,
        fingerprint: latest.fingerprint,
        reason: latest.reason,
        decisionNote: dto.decisionNote ?? null,
        requestedBy: latest.requestedBy,
        decidedBy: ctx.user.id,
        decidedAt: new Date(),
      });
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      throw staleVersion('Waiver was decided concurrently; reload and retry', {
        proposalId,
        findingCode,
      });
    }

    this.safeCount('mentorship_conflict_waiver_decided_total', { decision: dto.decision });
    this.telemetry.event('mentorship.conflicts.waiver_decided', {
      proposalId,
      findingCode,
      decision: dto.decision,
    });
    return this.waiverView(created as WaiverRecord, true);
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private checkView(check: CheckRecord, includePrivate: boolean) {
    return {
      id: String(check._id ?? ''),
      proposalId: check.proposalId,
      mentorId: check.mentorId,
      menteeId: check.menteeId,
      programId: check.programId,
      rulesVersion: check.rulesVersion,
      checkVersion: check.checkVersion,
      outcome: check.outcome as CheckOutcome,
      findings: check.findings,
      inputHash: check.inputHash,
      checkedAt: check.checkedAt,
      checkedBy: check.checkedBy,
      ...(includePrivate ? { privateNotes: check.privateNotes } : {}),
    };
  }

  private waiverView(waiver: WaiverRecord, includePrivate: boolean) {
    return {
      id: String(waiver._id ?? ''),
      proposalId: waiver.proposalId,
      checkId: waiver.checkId,
      findingCode: waiver.findingCode,
      version: waiver.version,
      status: waiver.status,
      requestedBy: waiver.requestedBy,
      decidedBy: waiver.decidedBy,
      decidedAt: waiver.decidedAt,
      ...(includePrivate
        ? { reason: waiver.reason, decisionNote: waiver.decisionNote }
        : {}),
    };
  }

  private hash(input: unknown): string {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }

  private safeCount(name: string, labels: Record<string, string> = {}): void {
    try {
      this.telemetry.count(name, labels);
    } catch {
      // Telemetry is best effort and must never break a conflict decision.
    }
  }
}
