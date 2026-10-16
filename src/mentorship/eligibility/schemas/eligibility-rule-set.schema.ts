import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { EligibilityRule } from '../domain/eligibility-rule.types';

export type EligibilityRuleSetDocument = HydratedDocument<EligibilityRuleSet>;

/**
 * Immutable, versioned eligibility rules for a program (MENTOR-033).
 * Every change creates a new version; evaluations and applications record
 * the version they were checked against.
 *
 * Privacy: rule params can be sensitive (e.g. invite-only course lists).
 * Only program owners/admins may read this collection through the API.
 */
@Schema({ collection: 'mentorship_eligibility_rule_sets', timestamps: { createdAt: true, updatedAt: false } })
export class EligibilityRuleSet {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  programId: string;

  @Prop({ required: true, min: 1 })
  version: number;

  @Prop({ type: [Object], default: [] })
  rules: EligibilityRule[];

  @Prop({ required: true })
  contentHash: string;

  @Prop({ required: true })
  publishedBy: string;

  createdAt?: Date;
}

export const EligibilityRuleSetSchema = SchemaFactory.createForClass(EligibilityRuleSet);

EligibilityRuleSetSchema.index({ programId: 1, version: 1 }, { unique: true });

const refuse = function () {
  throw new Error('Eligibility rule sets are immutable');
};
EligibilityRuleSetSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  { document: false, query: true },
  refuse,
);
