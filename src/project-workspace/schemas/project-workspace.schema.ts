import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProjectWorkspaceDocument = HydratedDocument<ProjectWorkspace>;

export enum WorkspaceStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

export enum WorkspaceRole {
  OWNER = 'owner',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export enum ObjectiveStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

@Schema({ _id: false })
export class WorkspaceMember {
  @Prop({ required: true, index: true })
  userId!: string;

  @Prop({ required: true, enum: WorkspaceRole })
  role!: WorkspaceRole;

  @Prop({ type: Date, default: () => new Date() })
  joinedAt!: Date;
}

export const WorkspaceMemberSchema =
  SchemaFactory.createForClass(WorkspaceMember);

@Schema({ _id: false })
export class WorkspaceObjective {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({
    required: true,
    enum: ObjectiveStatus,
    default: ObjectiveStatus.PLANNED,
  })
  status!: ObjectiveStatus;

  @Prop({ type: Date, default: null })
  dueAt!: Date | null;
}

export const WorkspaceObjectiveSchema =
  SchemaFactory.createForClass(WorkspaceObjective);

@Schema({ _id: false })
export class WorkspaceMilestone {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: Date, default: null })
  dueAt!: Date | null;

  @Prop({ default: false })
  complete!: boolean;
}

export const WorkspaceMilestoneSchema =
  SchemaFactory.createForClass(WorkspaceMilestone);

export enum WorkspacePauseStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  REJECTED = 'rejected',
  RESUMED = 'resumed',
  EXPIRED = 'expired',
}

export enum WorkspaceFundingImpact {
  NONE = 'none',
  REVIEW_REQUIRED = 'review_required',
}

@Schema({ _id: false })
export class WorkspacePrivateReason {
  @Prop({ required: true })
  ciphertext!: string;

  @Prop({ required: true })
  iv!: string;

  @Prop({ required: true })
  authTag!: string;

  @Prop({ required: true })
  keyId!: string;

  @Prop({ required: true })
  algorithm!: string;
}

export const WorkspacePrivateReasonSchema =
  SchemaFactory.createForClass(WorkspacePrivateReason);

@Schema({ _id: false })
export class WorkspacePause {
  @Prop({ required: true })
  pauseId!: string;

  @Prop({ required: true, enum: WorkspacePauseStatus })
  status!: WorkspacePauseStatus;

  @Prop({ required: true })
  requestedBy!: string;

  @Prop({ type: WorkspacePrivateReasonSchema, required: true })
  reason!: WorkspacePrivateReason;

  @Prop({ type: Date, required: true })
  requestedAt!: Date;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ required: true, enum: WorkspaceFundingImpact })
  fundingImpact!: WorkspaceFundingImpact;

  @Prop({ type: String, default: null })
  requestKey!: string | null;

  @Prop({ type: String, default: null })
  requestFingerprint!: string | null;

  @Prop({ type: String, default: null })
  decidedBy!: string | null;

  @Prop({ type: WorkspacePrivateReasonSchema, default: null })
  decisionReason!: WorkspacePrivateReason | null;

  @Prop({ type: String, default: null })
  decisionKey!: string | null;

  @Prop({ type: String, default: null })
  decisionFingerprint!: string | null;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  @Prop({ type: Date, default: null })
  pausedAt!: Date | null;

  @Prop({ type: Date, default: null })
  resumedAt!: Date | null;

  @Prop({ type: Date, default: null })
  expiredAt!: Date | null;

  @Prop({ type: String, default: null })
  resumeKey!: string | null;

  @Prop({ type: String, default: null })
  resumeFingerprint!: string | null;

  @Prop({ type: Number, default: 0 })
  deadlineShiftMs!: number;
}

export const WorkspacePauseSchema =
  SchemaFactory.createForClass(WorkspacePause);

@Schema({ timestamps: true, collection: 'project_workspaces' })
export class ProjectWorkspace {
  @Prop({ required: true, index: true })
  tenantId!: string;

  /** Stable, caller-supplied workspace key; unique within the tenant. */
  @Prop({ required: true, index: true })
  key!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ type: String, default: null })
  summary!: string | null;

  @Prop({ type: Date, default: null })
  deadlineAt!: Date | null;

  @Prop({
    required: true,
    enum: WorkspaceStatus,
    default: WorkspaceStatus.DRAFT,
    index: true,
  })
  status!: WorkspaceStatus;

  @Prop({ type: [WorkspaceMemberSchema], default: [] })
  members!: WorkspaceMember[];

  @Prop({ type: [WorkspaceObjectiveSchema], default: [] })
  objectives!: WorkspaceObjective[];

  @Prop({ type: [WorkspaceMilestoneSchema], default: [] })
  milestones!: WorkspaceMilestone[];

  @Prop({ type: [WorkspacePauseSchema], default: [] })
  pauseHistory!: WorkspacePause[];

  @Prop({ type: [String], default: [] })
  nextActions!: string[];

  /** Optimistic-lock version; every accepted mutation increments it. */
  @Prop({ required: true, default: 1 })
  version!: number;

  /** Idempotency key for creation retries; never returned by the API. */
  @Prop({ type: String, default: null })
  idempotencyKey!: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProjectWorkspaceSchema =
  SchemaFactory.createForClass(ProjectWorkspace);
ProjectWorkspaceSchema.index({ tenantId: 1, key: 1 }, { unique: true });
ProjectWorkspaceSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  },
);
