import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorkspaceActivityDocument = HydratedDocument<WorkspaceActivity>;

/**
 * Append-only activity trail for a workspace. Contains identifiers and an
 * action label only — never note text, resource bytes or private payloads.
 */
@Schema({ timestamps: true, collection: 'project_workspace_activity' })
export class WorkspaceActivity {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  projectId!: string;

  @Prop({ required: true })
  actorId!: string;

  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  targetType!: string;

  @Prop({ required: true })
  targetId!: string;

  @Prop({ type: String, default: null })
  requestId!: string | null;

  createdAt?: Date;
}

export const WorkspaceActivitySchema =
  SchemaFactory.createForClass(WorkspaceActivity);
WorkspaceActivitySchema.index({ tenantId: 1, projectId: 1, createdAt: -1 });
