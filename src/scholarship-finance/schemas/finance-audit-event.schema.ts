import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FinanceAuditEventDocument = HydratedDocument<FinanceAuditEvent>;

/** Append-only audit trail of every state-changing finance action. */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'scholarship_finance_audit',
})
export class FinanceAuditEvent {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ required: true })
  entityType: string;

  @Prop({ required: true })
  entityId: string;

  @Prop({ required: true })
  action: string;

  /** User id, or `system` for background jobs. */
  @Prop({ required: true })
  actorId: string;

  @Prop({ type: String, default: null })
  reason: string | null;

  @Prop({ type: Object, default: {} })
  details: Record<string, unknown>;
}

export const FinanceAuditEventSchema =
  SchemaFactory.createForClass(FinanceAuditEvent);
FinanceAuditEventSchema.index({
  organizationId: 1,
  entityType: 1,
  entityId: 1,
  createdAt: -1,
});
