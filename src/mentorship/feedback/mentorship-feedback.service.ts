import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SubmitFeedbackDto, UpdateFeedbackDto } from './dto/feedback.dto';
import {
  MentorshipSessionFeedback,
  MentorshipSessionFeedbackDocument,
} from './schemas/mentorship-feedback.schema';

export interface FeedbackActor {
  userId: string;
  roles?: string[];
}

@Injectable()
export class MentorshipFeedbackService {
  constructor(
    @InjectModel(MentorshipSessionFeedback.name)
    private readonly feedback: Model<MentorshipSessionFeedbackDocument>,
  ) {}

  private isStaff(actor: FeedbackActor): boolean {
    return (actor.roles ?? []).some((r) =>
      ['admin', 'moderator', 'staff'].includes(r),
    );
  }

  async submit(dto: SubmitFeedbackDto, actor: FeedbackActor) {
    const existing = await this.feedback
      .findOne({ sessionId: dto.sessionId, role: dto.role })
      .exec();
    if (existing) {
      throw new BadRequestException('FEEDBACK_ALREADY_SUBMITTED');
    }
    return this.feedback.create({
      sessionId: dto.sessionId,
      reviewerId: actor.userId,
      role: dto.role,
      rating: dto.rating,
      strengths: dto.strengths ?? [],
      comment: dto.comment ?? '',
      protectedComment: dto.protectedComment ?? false,
      revealAt: dto.revealAt ? new Date(dto.revealAt) : null,
      consentToAggregate: dto.consentToAggregate ?? true,
    });
  }

  async update(id: string, dto: UpdateFeedbackDto, actor: FeedbackActor) {
    const row = await this.feedback.findById(id).exec();
    if (!row) throw new NotFoundException('FEEDBACK_NOT_FOUND');
    if (row.reviewerId !== actor.userId && !this.isStaff(actor)) {
      throw new ForbiddenException('FEEDBACK_EDIT_FORBIDDEN');
    }
    if (
      row.revealAt &&
      row.revealAt.getTime() <= Date.now() &&
      !this.isStaff(actor)
    ) {
      throw new BadRequestException('FEEDBACK_EDIT_WINDOW_CLOSED');
    }
    if (dto.rating !== undefined) row.rating = dto.rating;
    if (dto.strengths !== undefined) row.strengths = dto.strengths;
    if (dto.comment !== undefined) row.comment = dto.comment;
    if (dto.protectedComment !== undefined)
      row.protectedComment = dto.protectedComment;
    if (dto.revealAt !== undefined)
      row.revealAt = dto.revealAt ? new Date(dto.revealAt) : null;
    if (dto.consentToAggregate !== undefined)
      row.consentToAggregate = dto.consentToAggregate;
    await row.save();
    return row;
  }

  async listForSession(sessionId: string, actor: FeedbackActor) {
    const rows = await this.feedback.find({ sessionId }).exec();
    return rows.map((r) => this.redact(r, actor));
  }

  private redact(row: MentorshipSessionFeedbackDocument, actor: FeedbackActor) {
    const obj = row.toObject();
    const isReviewer = row.reviewerId === actor.userId;
    const staff = this.isStaff(actor);
    const revealed = !row.revealAt || row.revealAt.getTime() <= Date.now();
    if (row.protectedComment && !isReviewer && !staff && !revealed) {
      obj.comment = '[protected until reveal]';
    }
    if (row.protectedComment && !isReviewer && !staff && revealed) {
      // retaliation-sensitive: keep restricted to reviewer/staff even after reveal in this scoped impl
      obj.comment = '[restricted]';
    }
    return obj;
  }

  async aggregate(sessionId: string) {
    const rows = await this.feedback
      .find({ sessionId, consentToAggregate: true })
      .exec();
    if (rows.length === 0) return { sessionId, count: 0, averageRating: null };
    const avg = rows.reduce((sum, r) => sum + r.rating, 0) / rows.length;
    return {
      sessionId,
      count: rows.length,
      averageRating: Number(avg.toFixed(2)),
    };
  }
}
