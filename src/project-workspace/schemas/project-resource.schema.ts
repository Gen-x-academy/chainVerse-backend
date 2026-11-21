import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProjectResourceDocument = HydratedDocument<ProjectResource>;

export enum ResourceKind {
  FILE = 'file',
  DATASET = 'dataset',
  LINK = 'link',
}

export enum ResourceStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

export enum ResourceAccessPolicy {
  PRIVATE = 'private',
  TEAM = 'team',
  PUBLIC = 'public',
}

@Schema({ _id: false })
export class ResourceVersion {
  @Prop({ required: true })
  version!: number;

  @Prop({ required: true })
  uri!: string;

  @Prop({ required: true })
  checksumSha256!: string;

  @Prop({ type: Date, default: () => new Date() })
  recordedAt!: Date;
}

export const ResourceVersionSchema =
  SchemaFactory.createForClass(ResourceVersion);

@Schema({ timestamps: true, collection: 'project_resources' })
export class ProjectResource {
  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  projectId!: string;

  @Prop({ required: true, enum: ResourceKind })
  kind!: ResourceKind;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  uri!: string;

  @Prop({ type: String, default: null })
  mimeType!: string | null;

  @Prop({ type: Number, default: null })
  sizeBytes!: number | null;

  /** SHA-256 of the approved bytes; mandatory for files and datasets. */
  @Prop({ required: true })
  checksumSha256!: string;

  @Prop({ type: String, default: null })
  license!: string | null;

  @Prop({ type: [String], default: [] })
  citations!: string[];

  @Prop({
    required: true,
    enum: ResourceAccessPolicy,
    default: ResourceAccessPolicy.PRIVATE,
  })
  accessPolicy!: ResourceAccessPolicy;

  @Prop({
    required: true,
    enum: ResourceStatus,
    default: ResourceStatus.PENDING,
    index: true,
  })
  status!: ResourceStatus;

  @Prop({ required: true, index: true })
  submittedBy!: string;

  @Prop({ type: String, default: null })
  reviewedBy!: string | null;

  @Prop({ type: Date, default: null })
  reviewedAt!: Date | null;

  @Prop({ type: String, default: null })
  rejectionReason!: string | null;

  @Prop({ type: [ResourceVersionSchema], default: [] })
  previousVersions!: ResourceVersion[];

  @Prop({ required: true, default: 1 })
  version!: number;

  @Prop({ type: String, default: null })
  idempotencyKey!: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProjectResourceSchema =
  SchemaFactory.createForClass(ProjectResource);
ProjectResourceSchema.index({ tenantId: 1, projectId: 1, status: 1 });
ProjectResourceSchema.index(
  { tenantId: 1, projectId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  },
);
