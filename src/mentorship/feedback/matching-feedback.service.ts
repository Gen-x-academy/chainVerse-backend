import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { MentorshipUser } from '../shared/mentorship-context';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';
import { FeedbackPolicy } from './feedback.policy';
import {
  FeedbackAggregateQueryDto,
  SubmitFeedbackDto,
} from './dto/matching-feedback.dto';
import {
  FEEDBACK_RETENTION_DAYS,
  FeedbackKind,
  MatchingFeedback,
  MatchingFeedbackDocument,
} from './schemas/matching-feedback.schema';

/** Suppress cohorts small enough to re-identify the people in them. */
export const MIN_FEEDBACK_COHORT = 5;

interface AggregateRow {
  _id: { kind: FeedbackKind; rating: number };
  count: number;
}

export interface FeedbackAggregate {
  kind: FeedbackKind;
  responses: number;
  averageRating: number;
  ratingDistribution: Record<string, number>;
}

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class MatchingFeedbackService {
  constructor(
    @InjectModel(MatchingFeedback.name)
    private readonly feedback: Model<MatchingFeedbackDocument>,
    private readonly policy: FeedbackPolicy,
    private readonly telemetry: MentorshipTelemetry,
  ) {}

  /** Feedback is write-once; there is deliberately no update or delete path. */
  async submit(user: MentorshipUser, dto: SubmitFeedbackDto) {
    this.policy.assertCanSubmit(user);
    if (dto.consentGiven !== true) {
      this.count('submit', 'consent_missing');
      throw new BadRequestException('FEEDBACK_CONSENT_REQUIRED');
    }
    const days = FEEDBACK_RETENTION_DAYS[dto.retentionPolicy];
    if (!days) {
      this.count('submit', 'retention_invalid');
      throw new BadRequestException('FEEDBACK_RETENTION_INVALID');
    }

    const idempotencyKeyHash = sha256(
      `${user.id}:${dto.kind}:${dto.idempotencyKey}`,
    );
    const existing = await this.feedback
      .findOne({ idempotencyKeyHash })
      .exec();
    if (existing) {
      this.count('submit', 'replayed');
      return this.toPublic(existing);
    }

    const freeText = dto.freeText?.trim() || null;
    const created = await this.feedback.create({
      actorId: user.id,
      subjectId: dto.subjectId,
      subjectType: dto.subjectType,
      kind: dto.kind,
      rating: dto.rating,
      freeText,
      freeTextHash: freeText ? sha256(freeText) : null,
      consentGiven: true,
      retentionPolicy: dto.retentionPolicy,
      retentionExpiresAt: new Date(Date.now() + days * 86400000),
      idempotencyKeyHash,
      anonymized: false,
    });

    this.count('submit', 'created');
    return this.toPublic(created);
  }

  async mine(user: MentorshipUser) {
    const rows = await this.feedback
      .find({ actorId: user.id })
      .sort({ createdAt: -1 })
      .exec();
    return rows.map((row) => this.toPublic(row));
  }

  /**
   * Free text is exposed only to the author or an auditing admin with a
   * reason, and never after the retention deadline. All other readers get a
   * safe snapshot with `freeText: null`.
   */
  async detail(user: MentorshipUser, id: string, reason?: string) {
    const feedback = await this.findById(id);
    const expired = feedback.retentionExpiresAt.getTime() <= Date.now();
    if (expired) {
      this.count('detail', 'retention_expired');
      return { ...this.toPublic(feedback), freeText: null, retentionExpired: true };
    }

    this.policy.assertCanReadFreeText(user, feedback.actorId, reason);
    this.count('detail', 'free_text_released');
    return {
      ...this.toPublic(feedback),
      subjectId: feedback.subjectId,
      freeText: feedback.freeText ?? null,
      retentionExpired: false,
    };
  }

  /** Anonymized ratings-only metrics; no ids or free text leave the service. */
  async aggregate(user: MentorshipUser, query: FeedbackAggregateQueryDto) {
    this.policy.assertCanAggregate(user);

    const match: Record<string, unknown> = {
      consentGiven: true,
      retentionExpiresAt: { $gt: new Date() },
    };
    if (query.kind) match.kind = query.kind;
    if (query.from || query.to) {
      const createdAt: Record<string, Date> = {};
      if (query.from) createdAt.$gte = new Date(query.from);
      if (query.to) createdAt.$lte = new Date(query.to);
      match.createdAt = createdAt;
    }

    const rows = await this.feedback
      .aggregate<AggregateRow>([
        { $match: match },
        {
          $project: {
            kind: 1,
            rating: 1,
            actorId: 0,
            subjectId: 0,
            freeText: 0,
            freeTextHash: 0,
            idempotencyKeyHash: 0,
          },
        },
        {
          $group: {
            _id: { kind: '$kind', rating: '$rating' },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    const byKind = new Map<
      FeedbackKind,
      { responses: number; total: number; distribution: Record<string, number> }
    >();
    for (const row of rows) {
      const kind = row._id.kind;
      const bucket = byKind.get(kind) ?? {
        responses: 0,
        total: 0,
        distribution: {},
      };
      bucket.responses += row.count;
      bucket.total += row._id.rating * row.count;
      bucket.distribution[String(row._id.rating)] = row.count;
      byKind.set(kind, bucket);
    }

    const result: FeedbackAggregate[] = [];
    for (const [kind, bucket] of byKind) {
      if (bucket.responses < MIN_FEEDBACK_COHORT) continue;
      result.push({
        kind,
        responses: bucket.responses,
        averageRating: Math.round((bucket.total / bucket.responses) * 100) / 100,
        ratingDistribution: bucket.distribution,
      });
    }
    this.count('aggregate', 'ok');
    return result.sort((a, b) => a.kind.localeCompare(b.kind));
  }

  private async findById(id: string): Promise<MatchingFeedbackDocument> {
    const found = await this.feedback.findById(id).exec();
    if (!found) throw new NotFoundException('FEEDBACK_NOT_FOUND');
    return found;
  }

  private toPublic(feedback: MatchingFeedbackDocument) {
    return {
      id: String(feedback._id),
      kind: feedback.kind,
      subjectType: feedback.subjectType,
      rating: feedback.rating,
      retentionPolicy: feedback.retentionPolicy,
      retentionExpiresAt: feedback.retentionExpiresAt,
      createdAt: feedback.createdAt,
    };
  }

  private count(event: string, outcome: string): void {
    try {
      this.telemetry.count('mentorship_feedback_events_total', { event, outcome });
    } catch {
      // Telemetry must never break a feedback path.
    }
  }
}
