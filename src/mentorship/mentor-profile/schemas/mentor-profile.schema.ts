import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum MentorProfileStatus {
  /** Never published, or unpublished. Only the owner can see it. */
  DRAFT = 'draft',
  /** Has a published version that viewers may see, subject to `visibility`. */
  PUBLISHED = 'published',
}

export enum MentorProfileVisibility {
  /** Any signed-in user may view the published profile. */
  PUBLIC = 'public',
  /** Same audience today; reserved for narrowing to program members. */
  MEMBERS = 'members',
  /** Only the owner. */
  PRIVATE = 'private',
}

export enum MentorProfileRevisionAction {
  DRAFT_SAVED = 'draft_saved',
  PUBLISHED = 'published',
  UNPUBLISHED = 'unpublished',
}

@Schema({ _id: false })
export class MentorProfileLink {
  @Prop({ required: true, trim: true, maxlength: 60 })
  label: string;

  @Prop({ required: true, trim: true, maxlength: 300 })
  url: string;
}
export const MentorProfileLinkSchema =
  SchemaFactory.createForClass(MentorProfileLink);

/**
 * The editable body of a profile. It exists twice on a profile: as the working
 * `draft` and as the `published` snapshot viewers see, so editing never changes what
 * the public sees until the owner publishes.
 */
@Schema({ _id: false })
export class MentorProfileContent {
  @Prop({ trim: true, maxlength: 120, default: '' })
  headline: string;

  @Prop({ trim: true, maxlength: 2000, default: '' })
  bio: string;

  @Prop({ type: [String], default: [] })
  expertise: string[];

  @Prop({ type: [String], default: [] })
  languages: string[];

  /** IANA time zone name, for example `Africa/Lagos`. */
  @Prop({ trim: true, maxlength: 64, default: '' })
  timeZone: string;

  @Prop({ min: 0, max: 80, default: 0 })
  yearsOfExperience: number;

  @Prop({ trim: true, maxlength: 1500, default: '' })
  teachingApproach: string;

  @Prop({ type: [MentorProfileLinkSchema], default: [] })
  links: MentorProfileLink[];

  @Prop({
    enum: MentorProfileVisibility,
    default: MentorProfileVisibility.PUBLIC,
  })
  visibility: MentorProfileVisibility;
}
export const MentorProfileContentSchema =
  SchemaFactory.createForClass(MentorProfileContent);

@Schema({ timestamps: true, collection: 'mentor_profiles' })
export class MentorProfile {
  /** JWT `sub` of the mentor. One profile per user (unique index). */
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({ type: MentorProfileContentSchema, default: () => ({}) })
  draft: MentorProfileContent;

  @Prop({ type: MentorProfileContentSchema, default: null })
  published: MentorProfileContent | null;

  @Prop({
    enum: MentorProfileStatus,
    default: MentorProfileStatus.DRAFT,
    index: true,
  })
  status: MentorProfileStatus;

  /** Increments on every effective change; the optimistic-concurrency token. */
  @Prop({ default: 0 })
  revision: number;

  @Prop({ type: Date, default: null })
  publishedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}
export type MentorProfileDocument = HydratedDocument<MentorProfile>;
export const MentorProfileSchema = SchemaFactory.createForClass(MentorProfile);

/**
 * Append-only audit trail: one row per effective change, with the content as it was
 * after the change. Rows are never updated or deleted.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'mentor_profile_revisions' })
export class MentorProfileRevision {
  @Prop({ required: true, index: true })
  profileId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  revision: number;

  @Prop({ required: true, enum: MentorProfileRevisionAction })
  action: MentorProfileRevisionAction;

  @Prop({ type: Object, required: true })
  snapshot: Record<string, unknown>;

  createdAt?: Date;
}
export type MentorProfileRevisionDocument =
  HydratedDocument<MentorProfileRevision>;
export const MentorProfileRevisionSchema = SchemaFactory.createForClass(
  MentorProfileRevision,
);
// One row per (profile, revision): a replayed write cannot add a second one.
MentorProfileRevisionSchema.index({ profileId: 1, revision: 1 }, { unique: true });
