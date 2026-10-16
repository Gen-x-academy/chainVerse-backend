import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Terms both participants consent to. Any change bumps `termsVersion`. */
@Schema({ _id: false })
export class MatchTerms {
  @Prop({ required: true, min: 1 })
  sessionsPerMonth!: number;

  @Prop({ required: true, min: 15 })
  sessionLengthMinutes!: number;

  @Prop({ required: true, min: 1 })
  durationWeeks!: number;

  /** Decimal string to avoid float drift; settled on-chain by the payments track. */
  @Prop({ required: true })
  pricePerSession!: string;

  @Prop({ required: true })
  currency!: string;

  @Prop({ type: String, default: null })
  notes!: string | null;
}

export const MatchTermsSchema = SchemaFactory.createForClass(MatchTerms);
