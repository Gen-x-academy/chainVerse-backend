import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  MilestoneScheduleStatus,
  MilestoneType,
} from '../scholarship.constants';
import { applyImmutableFields } from './immutable-fields';

export type MilestoneScheduleDocument = HydratedDocument<MilestoneSchedule>;

@Schema({ _id: false })
export class MilestoneDefinition {
  /** Stable identifier; evidence, decisions and intents reference it. */
  @Prop({ required: true })
  key: string;

  @Prop({ type: String, required: true, enum: Object.values(MilestoneType) })
  type: MilestoneType;

  @Prop({ required: true, maxlength: 200 })
  title: string;

  @Prop({ type: String, default: null, maxlength: 2000 })
  description: string | null;

  @Prop({ required: true, min: 1, max: 10_000 })
  percentageBps: number;

  @Prop({ required: true, min: 1 })
  amountMinor: number;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ required: true, min: 0 })
  sequence: number;
}

export const MilestoneDefinitionSchema =
  SchemaFactory.createForClass(MilestoneDefinition);

/**
 * One version of an award's disbursement plan.
 *
 * Lifecycle: `draft` → `active` → (`superseded` by an approved amendment).
 * An amendment is itself a schedule in `pending_amendment` that references the
 * active schedule it would replace; a second owner/admin must approve it.
 */
@Schema({ timestamps: true, collection: 'scholarship_milestone_schedules' })
export class MilestoneSchedule {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  awardId: string;

  /** Monotonic per award, starting at 1. */
  @Prop({ required: true, min: 1 })
  version: number;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(MilestoneScheduleStatus),
    default: MilestoneScheduleStatus.DRAFT,
  })
  status: MilestoneScheduleStatus;

  /** Snapshot of the award total the milestones reconcile against. */
  @Prop({ required: true, min: 1 })
  totalAmountMinor: number;

  @Prop({ required: true, uppercase: true })
  currency: string;

  @Prop({ type: [MilestoneDefinitionSchema], default: [] })
  milestones: MilestoneDefinition[];

  @Prop({ required: true })
  createdBy: string;

  @Prop({ type: Date, default: null })
  activatedAt: Date | null;

  @Prop({ type: String, default: null })
  activatedBy: string | null;

  @Prop({ type: Date, default: null })
  supersededAt: Date | null;

  @Prop({ type: String, default: null })
  supersededByScheduleId: string | null;

  // ── Amendment governance (only set on pending_amendment schedules) ────────
  @Prop({ type: String, default: null })
  amendsScheduleId: string | null;

  @Prop({ type: String, default: null, maxlength: 1000 })
  amendmentReason: string | null;

  @Prop({ type: String, default: null })
  amendmentDecidedBy: string | null;

  @Prop({ type: Date, default: null })
  amendmentDecidedAt: Date | null;

  @Prop({ type: String, default: null, maxlength: 1000 })
  amendmentDecisionNote: string | null;
}

export const MilestoneScheduleSchema =
  SchemaFactory.createForClass(MilestoneSchedule);

MilestoneScheduleSchema.index({ awardId: 1, version: 1 }, { unique: true });

// At most one binding schedule per award.
MilestoneScheduleSchema.index(
  { awardId: 1 },
  {
    unique: true,
    name: 'one_active_schedule_per_award',
    partialFilterExpression: { status: MilestoneScheduleStatus.ACTIVE },
  },
);

// At most one open draft and one open amendment per award.
MilestoneScheduleSchema.index(
  { awardId: 1, status: 1 },
  {
    unique: true,
    name: 'one_open_draft_or_amendment_per_award',
    partialFilterExpression: {
      status: {
        $in: [
          MilestoneScheduleStatus.DRAFT,
          MilestoneScheduleStatus.PENDING_AMENDMENT,
        ],
      },
    },
  },
);

// Milestones may only be rewritten while the schedule is a draft, and the
// filter of that write must say so.
applyImmutableFields(
  MilestoneScheduleSchema,
  'MilestoneSchedule',
  ['milestones'],
  {
    allowWhenFilter: (filter) =>
      filter.status === MilestoneScheduleStatus.DRAFT,
    allowWhenDocument: (doc) => doc.status === MilestoneScheduleStatus.DRAFT,
  },
);
applyImmutableFields(MilestoneScheduleSchema, 'MilestoneSchedule', [
  'organizationId',
  'awardId',
  'version',
  'totalAmountMinor',
  'currency',
  'amendsScheduleId',
  'createdBy',
]);
