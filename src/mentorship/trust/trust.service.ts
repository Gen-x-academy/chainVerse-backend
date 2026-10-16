import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TrustIndicator,
  TrustSignals,
  computeTrustIndicators,
  emptySignals,
} from './trust-indicators';
import {
  MentorTrustSignals,
  MentorTrustSignalsDocument,
} from './trust-signals.schema';

const SIGNAL_KEYS = Object.keys(emptySignals()) as (keyof TrustSignals)[];

@Injectable()
export class MentorTrustService {
  constructor(
    @InjectModel(MentorTrustSignals.name)
    private readonly signals: Model<MentorTrustSignalsDocument>,
  ) {}

  /** Indicators only — raw signal values are never returned. */
  async getIndicators(mentorId: string): Promise<{
    mentorId: string;
    indicators: TrustIndicator[];
  }> {
    const row = await this.signals.findOne({ mentorId }).lean().exec();
    const input = { ...emptySignals() };
    if (row) for (const key of SIGNAL_KEYS) input[key] = row[key] ?? 0;
    return { mentorId, indicators: computeTrustIndicators(input) };
  }

  /**
   * Internal API for other services (credentials, sessions, moderation) to
   * report activity. Only whitelisted counters are written, as absolute values.
   */
  async recordSignals(
    mentorId: string,
    update: Partial<TrustSignals>,
  ): Promise<void> {
    const $set: Partial<TrustSignals> = {};
    for (const key of SIGNAL_KEYS) {
      const value = update[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        $set[key] = Math.floor(value);
      }
    }
    if (!Object.keys($set).length) return;
    await this.signals
      .updateOne({ mentorId }, { $set }, { upsert: true })
      .exec();
  }
}
