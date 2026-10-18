import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MentorshipTimelineEvent,
  MentorshipTimelineEventDocument,
  TimelineEventType,
  TimelineVisibility,
} from './schemas/mentorship-timeline-event.schema';
import {
  AppendTimelineEventDto,
  TimelinePageDto,
} from './dto/mentorship-timeline.dto';

export interface TimelineEntryView {
  id: string;
  sequence: number;
  type: TimelineEventType;
  subjectId: string;
  actorId: string;
  summary: string | null;
  occurredAt: string;
  /** Authorized detail view for the record this entry describes. */
  detailHref: string;
}

const DETAIL_PREFIX: Record<TimelineEventType, string> = {
  [TimelineEventType.GOAL]: '/mentorship/goals',
  [TimelineEventType.SESSION]: '/mentorship/sessions',
  [TimelineEventType.MILESTONE]: '/mentorship/milestones',
  [TimelineEventType.DELIVERABLE]: '/mentorship/deliverables',
  [TimelineEventType.DECISION]: '/mentorship/decisions',
  [TimelineEventType.AGREEMENT_CHANGE]: '/mentorship/agreements',
};

/**
 * Append-only progress timeline (MENTOR-075).
 *
 * Ordering is stable: entries carry a per-engagement monotonic `sequence`.
 * Pagination walks that sequence with a descending cursor, so pages never gap
 * when new events are appended mid-walk. Private entries are omitted entirely
 * for users outside their audience rather than poorly redacted.
 */
@Injectable()
export class MentorshipTimelineService {
  constructor(
    @InjectModel(MentorshipTimelineEvent.name)
    private readonly events: Model<MentorshipTimelineEventDocument>,
  ) {}

  /** Records an event; retries with the same unique key do not duplicate effects. */
  async append(actorId: string, dto: AppendTimelineEventDto) {
    const visibility = dto.visibility ?? TimelineVisibility.ENGAGEMENT;
    const allowedUserIds =
      visibility === TimelineVisibility.PRIVATE
        ? (dto.reviewerIds ?? []).filter((id) => id !== actorId)
        : [];

    // Allocate the next sequence atomically; a concurrent duplicate retries once.
    for (let attempt = 0; attempt < 3; attempt++) {
      const latest = await this.events
        .findOne({ engagementId: dto.engagementId })
        .sort({ sequence: -1 })
        .exec();
      const sequence = (latest?.sequence ?? 0) + 1;
      try {
        return await this.events.create({
          engagementId: dto.engagementId,
          sequence,
          type: dto.type,
          subjectId: dto.subjectId,
          actorId,
          summary: dto.summary ?? null,
          visibility,
          allowedUserIds,
          occurredAt: new Date(),
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }
    throw new ForbiddenException('TIMELINE_APPEND_CONFLICT');
  }

  /** Permission-filtered page in stable descending-sequence order. */
  async list(actorId: string, engagementId: string, page: TimelinePageDto) {
    const limit = page.limit ?? 50;
    const filter: Record<string, unknown> = { engagementId };
    if (page.before) filter.sequence = { $lt: page.before };
    filter.$or = [
      { visibility: TimelineVisibility.ENGAGEMENT },
      { actorId },
      { allowedUserIds: actorId },
    ];

    const rows = await this.events
      .find(filter)
      .sort({ sequence: -1 })
      .limit(limit + 1)
      .exec();

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && pageRows.length > 0
        ? pageRows[pageRows.length - 1].sequence
        : null;

    return {
      entries: pageRows.map((row) => this.view(row)),
      nextCursor,
      hasMore,
    };
  }

  /** Detail view of one entry, restricted to its authorized audience. */
  async getEntry(actorId: string, id: string) {
    const row = await this.events.findById(id).exec();
    if (!row) throw new NotFoundException('TIMELINE_ENTRY_NOT_FOUND');
    const visible =
      row.visibility === TimelineVisibility.ENGAGEMENT ||
      row.actorId === actorId ||
      row.allowedUserIds.includes(actorId);
    if (!visible) throw new NotFoundException('TIMELINE_ENTRY_NOT_FOUND');
    return this.view(row);
  }

  private view(row: MentorshipTimelineEventDocument): TimelineEntryView {
    return {
      id: row.id,
      sequence: row.sequence,
      type: row.type,
      subjectId: row.subjectId,
      actorId: row.actorId,
      summary: row.summary,
      occurredAt: row.occurredAt.toISOString(),
      detailHref: `${DETAIL_PREFIX[row.type]}/${row.subjectId}`,
    };
  }
}
