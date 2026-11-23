import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum WorkspaceStatus {
  ACTIVE = 'active',
  READ_ONLY = 'read_only',
}

@Schema({ _id: false })
export class WorkspaceAction {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ default: false })
  done!: boolean;

  @Prop({ required: true })
  createdBy!: string;
}

@Schema({ timestamps: true, collection: 'mentorship_workspaces' })
export class MentorshipWorkspace {
  @Prop({ required: true, unique: true, index: true })
  sessionId!: string;

  @Prop({ required: true, index: true })
  mentorId!: string;

  @Prop({ required: true, index: true })
  menteeId!: string;

  @Prop({ type: [String], default: [] })
  agenda!: string[];

  @Prop({ type: [String], default: [] })
  sharedGoals!: string[];

  @Prop({ type: [String], default: [] })
  permittedResources!: string[];

  @Prop({ type: Object, default: {} })
  attendanceState!: Record<string, unknown>;

  @Prop({ type: [Object], default: [] })
  followUpActions!: WorkspaceAction[];

  @Prop({
    required: true,
    enum: WorkspaceStatus,
    default: WorkspaceStatus.ACTIVE,
  })
  status!: WorkspaceStatus;

  @Prop({ required: true })
  createdBy!: string;
}

export type MentorshipWorkspaceDocument = HydratedDocument<MentorshipWorkspace>;
export const MentorshipWorkspaceSchema =
  SchemaFactory.createForClass(MentorshipWorkspace);
