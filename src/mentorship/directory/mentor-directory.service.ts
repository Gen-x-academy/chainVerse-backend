import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MentorProfile,
  MentorProfileDocument,
  MentorProfileStatus,
  MentorProfileVisibility,
} from '../mentor-profile/schemas/mentor-profile.schema';
import { toPublicView } from '../mentor-profile/mentor-profile.content';
import { MentorDirectoryQueryDto } from './mentor-directory.dto';
import { MentorAvailabilityService } from '../availability/availability.service';
import { MentorTrustService } from '../trust/trust.service';
import { MentorshipProgram, MentorshipProgramStatus } from '../programs/mentorship-program.schema';

@Injectable()
export class MentorDirectoryService {
  constructor(
    @InjectModel(MentorProfile.name)
    private readonly profiles: Model<MentorProfileDocument>,
    @InjectModel(MentorshipProgram.name)
    private readonly programs: Model<any>,
    private readonly availability: MentorAvailabilityService,
    private readonly trust: MentorTrustService,
  ) {}

  async search(query: MentorDirectoryQueryDto) {
    const filter: Record<string, unknown> = {
      status: MentorProfileStatus.PUBLISHED,
      'published.visibility': MentorProfileVisibility.PUBLIC,
    };
    if (query.q) {
      const safe = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const expression = new RegExp(safe, 'i');
      filter.$or = [{ 'published.headline': expression }, { 'published.bio': expression }];
    }
    if (query.language) filter['published.languages'] = query.language;
    if (query.expertise) filter['published.expertise'] = query.expertise;
    if (query.timeZone) filter['published.timeZone'] = new RegExp(`^${query.timeZone}`, 'i');
    if (query.deliveryMode) filter['published.deliveryMode'] = query.deliveryMode.toLowerCase();
    if (query.priceMin !== undefined) filter['published.hourlyRate'] = { $gte: query.priceMin };
    if (query.ratingMin !== undefined) filter['published.rating'] = { $gte: query.ratingMin };

    const limit = Math.min(query.limit ?? 20, 50);
    if (query.cursor) filter._id = { $gt: query.cursor };
    const rows = await this.profiles
      .find(filter)
      .select('_id published publishedAt')
      .sort({ _id: 1 })
      .limit(limit + 1)
      .lean()
      .exec();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: page.map((row) => ({
        ...toPublicView(row._id.toString(), row.published!),
        publishedAt: row.publishedAt?.toISOString() ?? null,
        stale: !row.publishedAt || Date.now() - row.publishedAt.getTime() > 90 * 24 * 60 * 60 * 1000,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
      limit,
    };
  }

  async detail(profileId: string) {
    const row = await this.profiles
      .findOne({
        _id: profileId,
        status: MentorProfileStatus.PUBLISHED,
        'published.visibility': MentorProfileVisibility.PUBLIC,
      })
      .select('_id published publishedAt')
      .lean()
      .exec();
    if (!row?.published) throw new NotFoundException('Mentor profile not found');
    const mentorId = row._id.toString();
    const [availability, reputation, programParticipation] = await Promise.all([
      this.availability.getPublic(mentorId),
      this.trust.getIndicators(mentorId),
      this.programs.countDocuments({ mentorId, status: MentorshipProgramStatus.ACTIVE }).exec(),
    ]);
    return {
      ...toPublicView(row._id.toString(), row.published),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      stale: !row.publishedAt || Date.now() - row.publishedAt.getTime() > 90 * 24 * 60 * 60 * 1000,
      availability,
      publicReputation: reputation.indicators,
      programParticipation,
      policies: { applicationRequired: true, privateAttributesHidden: true },
      applicationPath: `/api/v1/mentors/${mentorId}/applications`,
    };
  }
}
