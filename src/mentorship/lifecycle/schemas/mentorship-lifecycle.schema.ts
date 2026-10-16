import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MentorshipActorKind, MentorshipState } from '../mentorship-lifecycle.machine';

/** The current state of one mentorship, with a version for optimistic concurrency. */
@Schema({ timestamps: true, collection: 'mentorship_lifecycles' })
export class MentorshipLifecycle {
  /** Id of the mentorship this lifecycle belongs to. One lifecycle per mentorship. */
  @Prop({ required: true, unique: true, index: true })
  mentorshipId: string;

  @Prop({ required: true, enum: MentorshipState, default: MentorshipState.DRAFT, index: true })
  state: MentorshipState;

  /** Number of recorded transitions; the token every write is guarded by. */
  @Prop({ required: true, default: 0 })
  version: number;

  createdAt?: Date;
  updatedAt?: Date;
}
export type MentorshipLifecycleDocument = HydratedDocument<MentorshipLifecycle>;
export const MentorshipLifecycleSchema = SchemaFactory.createForClass(MentorshipLifecycle);

@Schema({ _id: false })
export class MentorshipTransitionActor {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true, enum: MentorshipActorKind })
  kind: MentorshipActorKind;
}
export const MentorshipTransitionActorSchema = SchemaFactory.createForClass(
  MentorshipTransitionActor,
);

/**
 * Append-only history: one row per change of state with who, why, when and the prior
 * state. Unique on `(mentorshipId, sequence)` so a replay cannot record a change twice.
 */
@Schema({ collection: 'mentorship_lifecycle_events' })
export class MentorshipLifecycleEvent {
  @Prop({ required: true, index: true })
  mentorshipId: string;

  /** 1-based position in this mentorship's history. */
  @Prop({ required: true })
  sequence: number;

  @Prop({ required: true, enum: MentorshipState })
  from: MentorshipState;

  @Prop({ required: true, enum: MentorshipState })
  to: MentorshipState;

  @Prop({ type: MentorshipTransitionActorSchema, required: true })
  actor: MentorshipTransitionActor;

  @Prop({ type: String, default: null })
  reason: string | null;

  @Prop({ required: true })
  at: Date;
}
export type MentorshipLifecycleEventDocument = HydratedDocument<MentorshipLifecycleEvent>;
export const MentorshipLifecycleEventSchema = SchemaFactory.createForClass(
  MentorshipLifecycleEvent,
);
MentorshipLifecycleEventSchema.index({ mentorshipId: 1, sequence: 1 }, { unique: true });
