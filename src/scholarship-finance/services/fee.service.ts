import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BusinessRuleException,
  ErrorCode,
  ValidationDomainException,
} from '../../common/errors';
import { FeeEvent } from '../domain/finance.enums';
import {
  calculateFees,
  FeeBreakdown,
  FeeScheduleRef,
  NO_FEE_SCHEDULE,
} from '../domain/fee-calculator';
import { assetKey } from '../domain/ledger-accounts';
import { CreateFeeScheduleDto, FeePreviewDto } from '../dto/fee-schedule.dto';
import {
  FeeSchedule,
  FeeScheduleDocument,
} from '../schemas/fee-schedule.schema';
import { FinanceAuditService } from './finance-audit.service';

const DUPLICATE_KEY = 11000;

@Injectable()
export class FeeService {
  constructor(
    @InjectModel(FeeSchedule.name)
    private readonly scheduleModel: Model<FeeScheduleDocument>,
    private readonly audit: FinanceAuditService,
  ) {}

  /**
   * Publishes a new immutable schedule version. Versions are sequential per
   * tenant + asset; a concurrent publish loses on the unique index and must
   * retry, so no version number is ever reused.
   */
  async publish(
    organizationId: string,
    dto: CreateFeeScheduleDto,
    actorId: string,
  ) {
    const now = Date.now();
    const effectiveFrom = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : new Date(now);
    if (effectiveFrom.getTime() < now - 60_000) {
      throw new ValidationDomainException(
        'effectiveFrom cannot be in the past; fees are never applied retroactively',
      );
    }
    for (const rule of dto.rules) {
      if (
        rule.minMinor != null &&
        rule.maxMinor != null &&
        rule.minMinor > rule.maxMinor
      ) {
        throw new ValidationDomainException(
          'Fee rule minMinor cannot exceed maxMinor',
        );
      }
    }

    const key = assetKey({
      code: dto.asset.code,
      issuer: dto.asset.issuer ?? null,
    });
    const latest = await this.scheduleModel
      .findOne({ organizationId, assetKey: key })
      .sort({ version: -1 })
      .lean();

    let schedule: FeeScheduleDocument;
    try {
      schedule = await this.scheduleModel.create({
        organizationId,
        assetKey: key,
        version: (latest?.version ?? 0) + 1,
        effectiveFrom,
        rounding: dto.rounding,
        rules: dto.rules.map((r) => ({
          ...r,
          minMinor: r.minMinor ?? null,
          maxMinor: r.maxMinor ?? null,
        })),
        reason: dto.reason,
        createdBy: actorId,
      });
    } catch (err) {
      if ((err as { code?: number }).code === DUPLICATE_KEY) {
        throw new BusinessRuleException(
          'Another fee schedule version was published concurrently; retry',
          ErrorCode.BIZ_DUPLICATE_REQUEST,
        );
      }
      throw err;
    }

    await this.audit.record({
      organizationId,
      entityType: 'fee_schedule',
      entityId: schedule.id,
      action: 'published',
      actorId,
      reason: dto.reason,
      details: {
        assetKey: key,
        version: schedule.version,
        previousVersion: latest?.version ?? null,
      },
    });
    return schedule;
  }

  list(organizationId: string, asset?: string) {
    const filter: Record<string, unknown> = { organizationId };
    if (asset) filter.assetKey = asset;
    return this.scheduleModel
      .find(filter)
      .sort({ assetKey: 1, version: -1 })
      .lean();
  }

  /** Schedule in force for the asset at `at`, or a zero-fee schedule if none is configured. */
  async resolve(
    organizationId: string,
    key: string,
    at = new Date(),
  ): Promise<FeeScheduleRef> {
    const doc = await this.scheduleModel
      .findOne({ organizationId, assetKey: key, effectiveFrom: { $lte: at } })
      .sort({ effectiveFrom: -1, version: -1 })
      .lean();
    if (!doc) return NO_FEE_SCHEDULE;
    return {
      id: String(doc._id),
      version: doc.version,
      rounding: doc.rounding,
      rules: doc.rules,
    };
  }

  async calculate(
    organizationId: string,
    key: string,
    event: FeeEvent,
    amountMinor: number,
    at = new Date(),
  ): Promise<FeeBreakdown> {
    const schedule = await this.resolve(organizationId, key, at);
    try {
      return calculateFees(event, amountMinor, schedule);
    } catch (err) {
      if (err instanceof RangeError) {
        throw new BusinessRuleException(
          err.message,
          ErrorCode.BIZ_FEE_EXCEEDS_AMOUNT,
        );
      }
      throw err;
    }
  }

  async preview(organizationId: string, dto: FeePreviewDto) {
    const key = assetKey({
      code: dto.asset.code,
      issuer: dto.asset.issuer ?? null,
    });
    const breakdown = await this.calculate(
      organizationId,
      key,
      dto.event,
      dto.amountMinor,
      dto.at ? new Date(dto.at) : new Date(),
    );
    return { assetKey: key, ...breakdown };
  }
}
