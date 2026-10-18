import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DELIVERABLE_SIZE_LIMITS,
  DeliverableDecision,
  DeliverableKind,
  DeliverableStatus,
  MentorshipDeliverable,
  MentorshipDeliverableDocument,
  MentorshipDeliverableReview,
  MentorshipDeliverableReviewDocument,
} from './schemas/mentorship-deliverable.schema';
import {
  ReviewDeliverableDto,
  SubmitDeliverableDto,
} from './dto/mentorship-deliverable.dto';

const DECISION_STATUS: Record<DeliverableDecision, DeliverableStatus> = {
  [DeliverableDecision.ACCEPT]: DeliverableStatus.ACCEPTED,
  [DeliverableDecision.REQUEST_CHANGES]: DeliverableStatus.CHANGES_REQUESTED,
  [DeliverableDecision.REJECT]: DeliverableStatus.REJECTED,
};

const DECIDED: ReadonlySet<DeliverableStatus> = new Set([
  DeliverableStatus.ACCEPTED,
  DeliverableStatus.REJECTED,
]);

/**
 * Mentorship deliverable submissions and reviews (MENTOR-073 / MENTOR-074).
 *
 * Versions are immutable: a resubmission writes a new version row. Reviews are
 * append-only and idempotent per (deliverable, reviewer, decision). Acceptance
 * dispatches its downstream effect exactly once, guarded by a flag.
 */
@Injectable()
export class MentorshipDeliverablesService {
  constructor(
    @InjectModel(MentorshipDeliverable.name)
    private readonly deliverables: Model<MentorshipDeliverableDocument>,
    @InjectModel(MentorshipDeliverableReview.name)
    private readonly reviews: Model<MentorshipDeliverableReviewDocument>,
  ) {}

  async submit(actorId: string, dto: SubmitDeliverableDto) {
    const limit = DELIVERABLE_SIZE_LIMITS[dto.kind];
    const sizeBytes = dto.sizeBytes ?? 0;
    if (sizeBytes > limit) {
      throw new BadRequestException(
        `DELIVERABLE_TOO_LARGE: ${dto.kind} submissions are limited to ${limit} bytes`,
      );
    }
    if (dto.kind === DeliverableKind.TEXT && dto.reference.length > limit) {
      throw new BadRequestException(
        `DELIVERABLE_TOO_LARGE: text submissions are limited to ${limit} characters`,
      );
    }
    const reviewerIds = (dto.reviewerIds ?? []).filter((id) => id !== actorId);
    if ((dto.reviewerIds ?? []).includes(actorId)) {
      throw new BadRequestException(
        'SUBMITTER_CANNOT_REVIEW: remove yourself from reviewerIds',
      );
    }

    const latest = await this.deliverables
      .findOne({ engagementId: dto.engagementId, milestoneId: dto.milestoneId })
      .sort({ version: -1 })
      .exec();
    const version = (latest?.version ?? 0) + 1;
    const dueAt = dto.milestoneDueAt ? new Date(dto.milestoneDueAt) : null;

    try {
      return await this.deliverables.create({
        engagementId: dto.engagementId,
        milestoneId: dto.milestoneId,
        submitterId: actorId,
        version,
        kind: dto.kind,
        reference: dto.reference,
        declaration: dto.declaration ?? null,
        sizeBytes,
        integrityHash: dto.integrityHash ?? null,
        status: DeliverableStatus.SUBMITTED,
        reviewerIds,
        late: dueAt ? Date.now() > dueAt.getTime() : false,
        accessExpiresAt: dto.accessTtlHours
          ? new Date(Date.now() + dto.accessTtlHours * 3_600_000)
          : null,
        acceptanceDispatched: false,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        // Same version submitted twice concurrently — return the stored row.
        return this.deliverables
          .findOne({
            engagementId: dto.engagementId,
            milestoneId: dto.milestoneId,
            version,
          })
          .exec();
      }
      throw error;
    }
  }

  async listForMilestone(actorId: string, milestoneId: string) {
    return this.deliverables
      .find({
        milestoneId,
        $or: [{ submitterId: actorId }, { reviewerIds: actorId }],
      })
      .sort({ version: 1 })
      .exec();
  }

  async get(actorId: string, id: string) {
    const doc = await this.deliverables.findById(id).exec();
    if (!doc) throw new NotFoundException('MENTOR_DELIVERABLE_NOT_FOUND');
    const isParty =
      doc.submitterId === actorId ||
      doc.reviewerIds.includes(actorId) ||
      doc.decidedBy === actorId;
    if (!isParty) throw new ForbiddenException('MENTOR_ACCESS_DENIED');
    return doc;
  }

  /**
   * Records a review decision on the current eligible version. Only explicitly
   * authorised reviewers may decide, the submitter can never review their own
   * work, and an identical retried decision is a no-op returning the stored row.
   */
  async review(
    actorId: string,
    deliverableId: string,
    dto: ReviewDeliverableDto,
  ) {
    const doc = await this.deliverables.findById(deliverableId).exec();
    if (!doc) throw new NotFoundException('MENTOR_DELIVERABLE_NOT_FOUND');
    if (doc.submitterId === actorId) {
      throw new ForbiddenException('SUBMITTER_CANNOT_REVIEW');
    }
    if (!doc.reviewerIds.includes(actorId)) {
      throw new ForbiddenException('MENTOR_NOT_A_REVIEWER');
    }

    const decision = dto.decision as DeliverableDecision;

    const existing = await this.reviews
      .findOne({ deliverableId, reviewerId: actorId, decision })
      .exec();
    if (existing) return { deliverable: doc, review: existing, replayed: true };

    // Only the current eligible version may be reviewed.
    const current = await this.deliverables
      .findOne({ engagementId: doc.engagementId, milestoneId: doc.milestoneId })
      .sort({ version: -1 })
      .exec();
    if (!current || current.version !== doc.version) {
      throw new BadRequestException('DELIVERABLE_VERSION_NOT_CURRENT');
    }
    if (DECIDED.has(doc.status)) {
      throw new BadRequestException('MENTOR_ALREADY_DECIDED');
    }

    const review = await this.reviews.create({
      deliverableId,
      reviewerId: actorId,
      decision,
      reason: dto.reason ?? null,
      rubricScores: dto.rubricScores ?? [],
      comments: dto.comments ?? [],
    });

    const update: Record<string, unknown> = {
      status: DECISION_STATUS[decision],
      decidedAt: new Date(),
      decidedBy: actorId,
    };
    // Acceptance side effect fires at most once across all reviewers.
    if (decision === DeliverableDecision.ACCEPT && !doc.acceptanceDispatched) {
      update.acceptanceDispatched = true;
    }
    const deliverable = await this.deliverables
      .findByIdAndUpdate(deliverableId, { $set: update }, { new: true })
      .exec();

    return { deliverable, review, replayed: false };
  }

  /** Signed-link style access: private content is never public and access expires. */
  async accessReference(actorId: string, id: string) {
    const doc = await this.get(actorId, id);
    if (doc.accessExpiresAt && doc.accessExpiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('DELIVERABLE_ACCESS_EXPIRED');
    }
    return { reference: doc.reference, expiresAt: doc.accessExpiresAt };
  }
}
