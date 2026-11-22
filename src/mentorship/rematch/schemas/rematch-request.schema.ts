import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RematchRequestDocument = HydratedDocument<RematchRequest>;
export type RematchEventDocument = HydratedDocument<RematchEvent>;

export enum RematchState {
  REQUESTED = 'requested',
  REVIEWED = 'reviewed',
  CLOSURE_PLANNED = 'closure_planned',
  PROPOSED = 'proposed',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

export enum RematchReasonCode {
  INCOMPATIBILITY = 'incompatibility',
  AVAILABILITY = 'availability',
  OTHER = 'other',
}

export enum BlockerKind {
  FINANCIAL = 'financial',
  SAFETY = 'safety',
}

export enum BlockerStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

export interface BlockerRef {
  kind: BlockerKind;
  ref: string;
  status: BlockerStatus;
}

export interface SuccessorProposal {
  candidateId: string;
  note?: string;
}

/** Allowed state transitions for the rematch workflow. */
export const REMATCH_TRANSITIONS: Record<RematchState, RematchState[]> = {
  [RematchState.REQUESTED]: [RematchState.REVIEWED, RematchState.CANCELLED],
  [RematchState.REVIEWED]: [RematchState.CLOSURE_PLANNED, RematchState.CANCELLED],
  [RematchState.CLOSURE_PLANNED]: [RematchState.PROPOSED, RematchState.CANCELLED],
  [RematchState.PROPOSED]: [RematchState.CLOSED, RematchState.CANCELLED],
  [RematchState.CLOSED]: [],
  [RematchState.CANCELLED]: [],
};

/**
 * A rematch request. `privateReason` is scoped to the requester and
 * coordinators only; every read projection intended for the counterpart
 * strips it. Prior records remain intact: state changes are accompanied by
 * append-only events and never overwrite history.
 */
@Schema({ timestamps: true, collection: 'mentorship_rematch_requests' })
export class RematchRequest {
  @Prop({ required: true, index: true })
  mentorshipId: string;

  @Prop({ required: true, index: true })
  requesterId: string;

  @Prop({ required: true })
  counterpartId: string;

  @Prop({ required: true, type: [String] })
  participantIds: string[];

  @Prop({
    required: true,
    enum: RematchState,
    default: RematchState.REQUESTED,
    index: true,
  })
  state: RematchState;

  @Prop({ required: true, enum: RematchReasonCode })
  reasonCode: RematchReasonCode;

  /** Private free text — only requester and coordinators may read it. */
  @Prop({ default: null })
  privateReason: string | null;

  /** Shared, non-blaming continuity plan. */
  @Prop({ default: null })
  continuityNotes: string | null;

  @Prop({ required: true, type: Array, default: [] })
  blockers: BlockerRef[];

  @Prop({ default: null, type: Object })
  successorProposal: SuccessorProposal | null;

  @Prop({ required: true, default: 1 })
  version: number;

  @Prop({ default: null })
  closedAt: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RematchRequestSchema = SchemaFactory.createForClass(RematchRequest);
// One open request per mentorship per requester; closed/cancelled rows may
// coexist as history.
RematchRequestSchema.index(
  { mentorshipId: 1, requesterId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      state: {
        $in: [
          RematchState.REQUESTED,
          RematchState.REVIEWED,
          RematchState.CLOSURE_PLANNED,
          RematchState.PROPOSED,
        ],
      },
    },
  },
);

/** Append-only audit of each state transition. */
@Schema({ timestamps: true, collection: 'mentorship_rematch_events' })
export class RematchEvent {
  @Prop({ required: true, index: true })
  rematchId: string;

  @Prop({ required: true })
  fromState: RematchState;

  @Prop({ required: true })
  toState: RematchState;

  @Prop({ required: true })
  actorId: string;

  @Prop({ required: true })
  action: string;

  @Prop({ default: null })
  note: string | null;

  @Prop({ required: true })
  occurredAt: Date;

  createdAt?: Date;
}

export const RematchEventSchema = SchemaFactory.createForClass(RematchEvent);
RematchEventSchema.index({ rematchId: 1, occurredAt: 1 });
