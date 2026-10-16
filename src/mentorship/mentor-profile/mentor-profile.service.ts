import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MentorProfile,
  MentorProfileDocument,
  MentorProfileRevision,
  MentorProfileRevisionAction,
  MentorProfileRevisionDocument,
  MentorProfileStatus,
  MentorProfileVisibility,
} from './schemas/mentor-profile.schema';
import { UpsertMentorProfileDto } from './dto/upsert-mentor-profile.dto';
import {
  contentEquals,
  isValidTimeZone,
  MentorProfileBody,
  missingForPublish,
  normalizeContent,
  PublicMentorProfileView,
  toBody,
  toPublicView,
} from './mentor-profile.content';
import {
  ResourceConflictException,
  ResourceNotFoundException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

/** What the owner sees: the working draft, the published copy, and what is missing. */
export interface OwnerMentorProfileView {
  id: string;
  status: MentorProfileStatus;
  revision: number;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  /** Fields still needed before the draft can be published. */
  missingForPublish: string[];
  draft: MentorProfileBody;
  published: MentorProfileBody | null;
}

export interface MentorProfileRevisionView {
  revision: number;
  action: MentorProfileRevisionAction;
  createdAt: string | undefined;
  snapshot: Record<string, unknown>;
}

const MAX_REVISIONS_PAGE = 50;
const DUPLICATE_KEY = 11000;

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === DUPLICATE_KEY;
}

@Injectable()
export class MentorProfileService {
  constructor(
    @InjectModel(MentorProfile.name)
    private readonly profiles: Model<MentorProfileDocument>,
    @InjectModel(MentorProfileRevision.name)
    private readonly revisions: Model<MentorProfileRevisionDocument>,
  ) {}

  // ── Owner operations ─────────────────────────────────────────────────────

  /**
   * Saves the draft, replacing it wholesale. Repeating the same request changes
   * nothing: no new revision is written and the revision number stays put.
   */
  async saveDraft(userId: string, dto: UpsertMentorProfileDto): Promise<OwnerMentorProfileView> {
    const draft = normalizeContent(dto);
    if (draft.timeZone && !isValidTimeZone(draft.timeZone)) {
      throw new ValidationDomainException(
        `timeZone '${draft.timeZone}' is not a recognised IANA time zone.`,
        ErrorCode.VAL_INVALID_FORMAT,
      );
    }

    const existing = await this.profiles.findOne({ userId }).exec();
    if (!existing) {
      return this.createProfile(userId, draft);
    }
    if (contentEquals(existing.draft, draft)) {
      return this.toOwnerView(existing);
    }
    return this.applyChange(existing, { draft }, MentorProfileRevisionAction.DRAFT_SAVED, draft);
  }

  async getOwn(userId: string): Promise<OwnerMentorProfileView> {
    return this.toOwnerView(await this.requireProfile(userId));
  }

  /** Publishes the current draft. Publishing an unchanged, already-published draft is a no-op. */
  async publish(userId: string): Promise<OwnerMentorProfileView> {
    const profile = await this.requireProfile(userId);

    const missing = missingForPublish(profile.draft);
    if (missing.length > 0) {
      throw new ValidationDomainException(
        `The profile cannot be published yet. Missing: ${missing.join(', ')}.`,
        ErrorCode.VAL_MENTOR_PROFILE_INCOMPLETE,
      );
    }
    if (
      profile.status === MentorProfileStatus.PUBLISHED &&
      profile.published &&
      contentEquals(profile.published, profile.draft)
    ) {
      return this.toOwnerView(profile);
    }

    const snapshot = toBody(profile.draft);
    return this.applyChange(
      profile,
      { published: snapshot, status: MentorProfileStatus.PUBLISHED, publishedAt: new Date() },
      MentorProfileRevisionAction.PUBLISHED,
      snapshot,
    );
  }

  /** Takes the profile out of view. The draft is kept. A no-op if it is not published. */
  async unpublish(userId: string): Promise<OwnerMentorProfileView> {
    const profile = await this.requireProfile(userId);
    if (profile.status === MentorProfileStatus.DRAFT) {
      return this.toOwnerView(profile);
    }
    return this.applyChange(
      profile,
      { published: null, status: MentorProfileStatus.DRAFT, publishedAt: null },
      MentorProfileRevisionAction.UNPUBLISHED,
      toBody(profile.draft),
    );
  }

  /** The owner's change history, newest first. */
  async listRevisions(userId: string, limit = 20): Promise<MentorProfileRevisionView[]> {
    const take = Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_REVISIONS_PAGE);
    const rows = await this.revisions
      .find({ userId })
      .sort({ revision: -1 })
      .limit(take)
      .exec();
    return rows.map((row) => ({
      revision: row.revision,
      action: row.action,
      createdAt: row.createdAt?.toISOString(),
      snapshot: row.snapshot,
    }));
  }

  // ── Viewer operation ─────────────────────────────────────────────────────

  /**
   * The published profile, as another signed-in user may see it. Drafts,
   * unpublished profiles and other people's private profiles all answer "not
   * found", so the response does not reveal that a hidden profile exists.
   */
  async getVisible(profileId: string, viewerId: string): Promise<PublicMentorProfileView> {
    const profile = await this.profiles.findById(profileId).exec();
    if (
      !profile ||
      profile.status !== MentorProfileStatus.PUBLISHED ||
      !profile.published
    ) {
      throw this.notFound();
    }
    const published = profile.published;
    if (
      published.visibility === MentorProfileVisibility.PRIVATE &&
      profile.userId !== viewerId
    ) {
      throw this.notFound();
    }
    return toPublicView(profile._id.toString(), published);
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private notFound(): ResourceNotFoundException {
    return new ResourceNotFoundException(
      'Mentor profile not found.',
      ErrorCode.RES_MENTOR_PROFILE_NOT_FOUND,
    );
  }

  private async requireProfile(userId: string): Promise<MentorProfileDocument> {
    const profile = await this.profiles.findOne({ userId }).exec();
    if (!profile) throw this.notFound();
    return profile;
  }

  private async createProfile(userId: string, draft: MentorProfileBody): Promise<OwnerMentorProfileView> {
    try {
      const created = await this.profiles.create({
        userId,
        draft,
        published: null,
        status: MentorProfileStatus.DRAFT,
        revision: 1,
        publishedAt: null,
      });
      await this.recordRevision(created, MentorProfileRevisionAction.DRAFT_SAVED, draft);
      return this.toOwnerView(created);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      // A concurrent first save won the unique index; apply this one on top of it.
      const winner = await this.requireProfile(userId);
      if (contentEquals(winner.draft, draft)) return this.toOwnerView(winner);
      return this.applyChange(winner, { draft }, MentorProfileRevisionAction.DRAFT_SAVED, draft);
    }
  }

  /**
   * Writes a change guarded by the revision the caller read. If another request got
   * there first the update matches nothing and the caller is told to retry, instead
   * of silently overwriting the other change.
   */
  private async applyChange(
    profile: MentorProfileDocument,
    set: Record<string, unknown>,
    action: MentorProfileRevisionAction,
    snapshot: MentorProfileBody,
  ): Promise<OwnerMentorProfileView> {
    const nextRevision = profile.revision + 1;
    const result = await this.profiles.updateOne(
      { _id: profile._id, revision: profile.revision },
      { $set: { ...set, revision: nextRevision } },
    );
    if (result.modifiedCount !== 1) {
      throw new ResourceConflictException(
        'The profile was changed by another request. Reload it and try again.',
        ErrorCode.BIZ_MENTOR_PROFILE_CONFLICT,
      );
    }

    const updated = await this.profiles.findById(profile._id).exec();
    if (!updated) throw this.notFound();
    await this.recordRevision(updated, action, snapshot, nextRevision);
    return this.toOwnerView(updated);
  }

  private async recordRevision(
    profile: MentorProfileDocument,
    action: MentorProfileRevisionAction,
    snapshot: MentorProfileBody,
    revision = profile.revision,
  ): Promise<void> {
    try {
      await this.revisions.create({
        profileId: profile._id.toString(),
        userId: profile.userId,
        revision,
        action,
        snapshot: { ...snapshot },
      });
    } catch (error) {
      // The (profile, revision) pair is unique: a replay already has its row.
      if (!isDuplicateKey(error)) throw error;
    }
  }

  private toOwnerView(profile: MentorProfileDocument): OwnerMentorProfileView {
    const draft = toBody(profile.draft);
    const published = profile.published ? toBody(profile.published) : null;
    return {
      id: profile._id.toString(),
      status: profile.status,
      revision: profile.revision,
      publishedAt: profile.publishedAt ? profile.publishedAt.toISOString() : null,
      hasUnpublishedChanges: published ? !contentEquals(published, draft) : true,
      missingForPublish: missingForPublish(draft),
      draft,
      published,
    };
  }
}
