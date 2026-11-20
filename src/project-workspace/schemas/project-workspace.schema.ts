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
