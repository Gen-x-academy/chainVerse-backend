import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditService } from '../../common/audit/audit.service';
import { AuditAction } from '../../common/audit/audit-action.enum';
import { canonicalize } from '../../common/audit/audit.service';
import {
  BusinessRuleException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { SubmitMilestoneEvidenceDto } from '../dto/submit-milestone-evidence.dto';
import {
  MilestoneEvidence,
  MilestoneEvidenceDocument,
} from '../schemas/milestone-evidence.schema';
import {
  MilestoneProgress,
  MilestoneProgressDocument,
} from '../schemas/milestone-progress.schema';
import {
  EVIDENCE_ACCEPTING_STATUSES,
  MILESTONE_KEY_PATTERN,
  MilestoneProgressStatus,
  ScholarshipAwardStatus,
} from '../scholarship.constants';
import { isDuplicateKeyError, ScholarshipActor } from '../scholarship-actor';
import { EvidenceEncryptionService } from './evidence-encryption.service';
import { MilestoneScheduleService } from './milestone-schedule.service';
import { ScholarshipAccessService } from './scholarship-access.service';

/** Upper bound on the serialized (pre-encryption) evidence content. */
const MAX_CONTENT_BYTES = 8 * 1024;
const MAX_INSERT_ATTEMPTS = 3;

/** Evidence as returned by list/submit — never includes the encrypted payload. */
export interface EvidenceView {
  id: string;
  organizationId: string;
  awardId: string;
  scheduleId: string;
  milestoneKey: string;
  version: number;
  submissionKey: string;
  evidenceType: string;
  submitterType: string;
  submittedBy: string;
  documentReferenceCount: number;
  createdAt?: Date;
}

export interface SubmitEvidenceResult {
  evidence: EvidenceView;
  /** True when an earlier identical submission was returned instead. */
  replayed: boolean;
}

export const toEvidenceView = (e: MilestoneEvidenceDocument): EvidenceView => ({
  id: e.id,
  organizationId: e.organizationId,
  awardId: e.awardId,
  scheduleId: e.scheduleId,
  milestoneKey: e.milestoneKey,
  version: e.version,
  submissionKey: e.submissionKey,
  evidenceType: e.evidenceType,
  submitterType: e.submitterType,
  submittedBy: e.submittedBy,
  documentReferenceCount: e.documentReferenceCount,
  createdAt: (e as unknown as { createdAt?: Date }).createdAt,
});

/** AAD binds a ciphertext to the record it belongs to. */
const evidenceAad = (e: {
  organizationId: string;
  awardId: string;
  milestoneKey: string;
  version: number;
}) =>
  `scholarship-evidence:${e.organizationId}:${e.awardId}:${e.milestoneKey}:${e.version}`;

@Injectable()
export class MilestoneEvidenceService {
  constructor(
    @InjectModel(MilestoneEvidence.name)
    private readonly evidenceModel: Model<MilestoneEvidenceDocument>,
    @InjectModel(MilestoneProgress.name)
    private readonly progressModel: Model<MilestoneProgressDocument>,
    private readonly access: ScholarshipAccessService,
    private readonly schedules: MilestoneScheduleService,
    private readonly encryption: EvidenceEncryptionService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Records a new evidence version, or returns the existing one when the call
   * is a duplicate:
   *  - same `submissionKey` + same content → the original submission;
   *  - same `submissionKey` + different content → 409 (key reuse);
   *  - new key but content identical to the latest version → that version.
   */
  async submit(
    organizationId: string,
    awardId: string,
    milestoneKey: string,
    dto: SubmitMilestoneEvidenceDto,
    actor: ScholarshipActor,
  ): Promise<SubmitEvidenceResult> {
    this.assertMilestoneKey(milestoneKey);
    const award = await this.access.requireAward(organizationId, awardId);
    const submitterType = await this.access.resolveSubmitterType(award, actor);

    if (award.status !== ScholarshipAwardStatus.ACTIVE) {
      throw new BusinessRuleException(
        'Award is not active',
        ErrorCode.BIZ_SCHOLARSHIP_MILESTONE_NOT_ACTIVE,
      );
    }

    const content = canonicalize({
      details: dto.details ?? {},
      documentReferences: dto.documentReferences ?? [],
    });
    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
      throw new BadRequestException(
        `Evidence content exceeds ${MAX_CONTENT_BYTES} bytes; submit document references instead of inline content`,
      );
    }
    const contentDigest = this.encryption.digest(
      `${awardId}:${milestoneKey}:${dto.evidenceType}:${content}`,
    );

    const replay = await this.findReplay(
      awardId,
      milestoneKey,
      dto.submissionKey,
      contentDigest,
    );
    if (replay) return { evidence: toEvidenceView(replay), replayed: true };

    const schedule = await this.schedules.findActive(organizationId, awardId);
    if (!schedule || !schedule.milestones.some((m) => m.key === milestoneKey)) {
      throw new BusinessRuleException(
        'Milestone is not part of the active schedule',
        ErrorCode.BIZ_SCHOLARSHIP_MILESTONE_NOT_ACTIVE,
      );
    }

    const progress = await this.progressModel
      .findOne({ awardId, milestoneKey })
      .exec();
    if (!progress || !EVIDENCE_ACCEPTING_STATUSES.includes(progress.status)) {
      throw new BusinessRuleException(
        `Milestone is ${progress?.status ?? 'unknown'} and does not accept evidence`,
        ErrorCode.BIZ_SCHOLARSHIP_MILESTONE_NOT_ACTIVE,
      );
    }

    if (progress.latestEvidenceId) {
      const latest = await this.evidenceModel
        .findById(progress.latestEvidenceId)
        .exec();
      if (latest && latest.contentDigest === contentDigest) {
        return { evidence: toEvidenceView(latest), replayed: true };
      }
    }

    const inserted = await this.insertNextVersion(
      {
        organizationId,
        awardId,
        scheduleId: schedule.id,
        milestoneKey,
        submissionKey: dto.submissionKey,
        evidenceType: dto.evidenceType,
        submitterType,
        submittedBy: actor.userId,
        contentDigest,
        documentReferenceCount: dto.documentReferences?.length ?? 0,
      },
      content,
    );
    if ('replay' in inserted) return inserted.replay;
    const { evidence } = inserted;

    const advanced = await this.progressModel
      .findOneAndUpdate(
        {
          awardId,
          milestoneKey,
          status: { $in: EVIDENCE_ACCEPTING_STATUSES },
          latestEvidenceVersion: { $lt: evidence.version },
        },
        {
          $set: {
            status: MilestoneProgressStatus.EVIDENCE_SUBMITTED,
            latestEvidenceId: evidence.id,
            latestEvidenceVersion: evidence.version,
          },
        },
        { new: true },
      )
      .exec();
    if (!advanced) {
      // A decision landed between our read and write. The stored version is
      // kept (evidence is append-only) but it will never be reviewed.
      throw new ResourceConflictException(
        'Milestone was decided while this evidence was being submitted',
        ErrorCode.BIZ_SCHOLARSHIP_EVIDENCE_STALE,
      );
    }

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_EVIDENCE_SUBMITTED,
      context: actor.audit,
      target: { type: 'scholarship_evidence', id: evidence.id },
      after: {
        awardId,
        milestoneKey,
        version: evidence.version,
        evidenceType: evidence.evidenceType,
        submitterType,
      },
    });

    return { evidence: toEvidenceView(evidence), replayed: false };
  }

  async list(
    organizationId: string,
    awardId: string,
    milestoneKey: string,
    actor: ScholarshipActor,
  ): Promise<EvidenceView[]> {
    this.assertMilestoneKey(milestoneKey);
    const award = await this.access.requireAward(organizationId, awardId);
    await this.access.assertCanReadEvidence(award, actor, milestoneKey);
    const records = await this.evidenceModel
      .find({ organizationId, awardId, milestoneKey })
      .sort({ version: -1 })
      .exec();
    return records.map(toEvidenceView);
  }

  /** Decrypts one evidence version. Every read is audited. */
  async reveal(
    organizationId: string,
    awardId: string,
    evidenceId: string,
    actor: ScholarshipActor,
  ): Promise<EvidenceView & { content: unknown }> {
    const award = await this.access.requireAward(organizationId, awardId);
    const evidence = await this.requireEvidence(
      organizationId,
      awardId,
      evidenceId,
    );
    await this.access.assertCanReadEvidence(
      award,
      actor,
      evidence.milestoneKey,
    );

    const plaintext = this.encryption.decrypt(
      evidence.payload,
      evidenceAad(evidence),
    );

    await this.auditService.record({
      action: AuditAction.SCHOLARSHIP_EVIDENCE_ACCESSED,
      context: actor.audit,
      target: { type: 'scholarship_evidence', id: evidence.id },
    });

    return { ...toEvidenceView(evidence), content: JSON.parse(plaintext) };
  }

  async requireEvidence(
    organizationId: string,
    awardId: string,
    evidenceId: string,
  ): Promise<MilestoneEvidenceDocument> {
    const evidence = await this.evidenceModel
      .findOne({ _id: evidenceId, organizationId, awardId })
      .exec();
    if (!evidence) {
      throw new ResourceNotFoundException('Evidence not found');
    }
    return evidence;
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private assertMilestoneKey(key: string): void {
    if (!MILESTONE_KEY_PATTERN.test(key)) {
      throw new BadRequestException('milestoneKey is malformed');
    }
  }

  private async findReplay(
    awardId: string,
    milestoneKey: string,
    submissionKey: string,
    contentDigest: string,
  ): Promise<MilestoneEvidenceDocument | null> {
    const prior = await this.evidenceModel
      .findOne({ awardId, milestoneKey, submissionKey })
      .exec();
    if (!prior) return null;
    if (prior.contentDigest !== contentDigest) {
      throw new ResourceConflictException(
        'submissionKey was already used with different evidence content',
        ErrorCode.BIZ_SCHOLARSHIP_EVIDENCE_KEY_REUSED,
      );
    }
    return prior;
  }

  /**
   * Inserts at `max(version) + 1`. Concurrent submitters collide on the unique
   * version index and retry; a collision on `submissionKey` means a retry of
   * this same request won, so its record is returned as a replay.
   */
  private async insertNextVersion(
    fields: Omit<MilestoneEvidence, 'version' | 'payload'>,
    content: string,
  ): Promise<
    { evidence: MilestoneEvidenceDocument } | { replay: SubmitEvidenceResult }
  > {
    for (let attempt = 1; attempt <= MAX_INSERT_ATTEMPTS; attempt++) {
      const latest = await this.evidenceModel
        .findOne({ awardId: fields.awardId, milestoneKey: fields.milestoneKey })
        .sort({ version: -1 })
        .select('version')
        .lean()
        .exec();
      const version = (latest?.version ?? 0) + 1;

      try {
        const evidence = await new this.evidenceModel({
          ...fields,
          version,
          payload: this.encryption.encrypt(
            content,
            evidenceAad({ ...fields, version }),
          ),
        }).save();
        return { evidence };
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err;
        const replay = await this.findReplay(
          fields.awardId,
          fields.milestoneKey,
          fields.submissionKey,
          fields.contentDigest,
        );
        if (replay) {
          return {
            replay: { evidence: toEvidenceView(replay), replayed: true },
          };
        }
      }
    }
    throw new ResourceConflictException(
      'Evidence is being submitted concurrently; retry with the same submissionKey',
    );
  }
}
