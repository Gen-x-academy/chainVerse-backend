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
  SPONSOR = 'sponsor',
}

export enum ProjectClosureReason {
  SUCCESSFUL_COMPLETION = 'successful_completion',
  MUTUAL_TERMINATION = 'mutual_termination',
  INACTIVITY = 'inactivity',
  POLICY_ACTION = 'policy_action',
  SPONSOR_WITHDRAWAL = 'sponsor_withdrawal',
}

export enum ProjectClosureOutcome {
  COMPLETED = 'completed',
  MUTUALLY_TERMINATED = 'mutually_terminated',
  TERMINATED_FOR_INACTIVITY = 'terminated_for_inactivity',
  TERMINATED_BY_POLICY = 'terminated_by_policy',
  TERMINATED_BY_SPONSOR = 'terminated_by_sponsor',
}

export enum ClosureConsentDecision {
  ACCEPT = 'accept',
}

@Schema({ _id: false })
export class ProjectClosureConsent {
  @Prop({ required: true })
  userId!: string;

  @Prop({ required: true, enum: ClosureConsentDecision })
  decision!: ClosureConsentDecision;

  @Prop({ required: true })
  idempotencyKey!: string;

  @Prop({ required: true })
  requestHash!: string;

  @Prop({ type: Date, required: true })
  consentedAt!: Date;
}

export const ProjectClosureConsentSchema =
  SchemaFactory.createForClass(ProjectClosureConsent);

@Schema({ _id: false })
export class ProjectTerminationProposal {
  @Prop({ required: true })
  idempotencyKey!: string;

  @Prop({ required: true })
  requestHash!: string;

  @Prop({ required: true })
  initiatedBy!: string;

  @Prop({ type: Date, required: true })
  initiatedAt!: Date;

  @Prop({ type: [ProjectClosureConsentSchema], default: [] })
  consents!: ProjectClosureConsent[];
}

export const ProjectTerminationProposalSchema = SchemaFactory.createForClass(
  ProjectTerminationProposal,
);

@Schema({ _id: false })
export class ProjectClosure {
  @Prop({ required: true, enum: ProjectClosureReason })
  reason!: ProjectClosureReason;

  @Prop({ required: true, enum: ProjectClosureOutcome })
  outcome!: ProjectClosureOutcome;

  @Prop({ type: Date, required: true })
  closedAt!: Date;

  @Prop({ required: true })
  closedBy!: string;

  @Prop({ required: true })
  idempotencyKey!: string;

  @Prop({ required: true })
  requestHash!: string;

  @Prop({ type: [ProjectClosureConsentSchema], default: [] })
  consents!: ProjectClosureConsent[];
}

export const ProjectClosureSchema =
  SchemaFactory.createForClass(ProjectClosure);

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

  @Prop({ type: ProjectTerminationProposalSchema, default: null })
  terminationProposal!: ProjectTerminationProposal | null;

  @Prop({ type: ProjectClosureSchema, default: null })
  closure!: ProjectClosure | null;

  /** Idempotency key for creation retries; never returned by the API. */
  @Prop({ type: String, default: null })
  idempotencyKey!: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProjectWorkspaceSchema =
  SchemaFactory.createForClass(ProjectWorkspace);
ProjectWorkspaceSchema.index({ tenantId: 1, key: 1 }, { unique: true });
ProjectWorkspaceSchema.index({ status: 1, updatedAt: 1 });
ProjectWorkspaceSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  },
);
