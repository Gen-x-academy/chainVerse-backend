import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ChargePolicy,
  ChargePolicyDocument,
} from '../schemas/charge-policy.schema';
import { ChargeType } from '../enums/charge-type.enum';
import { CreateChargePolicyDto } from '../dto/create-charge-policy.dto';
import { BusinessRuleException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

@Injectable()
export class ChargePolicyService {
  constructor(
    @InjectModel(ChargePolicy.name)
    private readonly chargePolicyModel: Model<ChargePolicyDocument>,
  ) {}

  // Creating a new policy closes out any currently open-ended policy for the
  // same chargeType+currency at the new policy's effectiveFrom. This is what
  // guarantees policy changes never rewrite past charges: a charge computed
  // yesterday still resolves to yesterday's policy version when looked up by
  // its effective-at date.
  async createPolicy(
    dto: CreateChargePolicyDto,
    createdBy: string,
  ): Promise<ChargePolicyDocument> {
    const effectiveFrom = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : new Date();

    await this.chargePolicyModel.updateMany(
      {
        chargeType: dto.chargeType,
        currency: dto.currency,
        isActive: true,
        effectiveTo: null,
      },
      { $set: { effectiveTo: effectiveFrom } },
    );

    return this.chargePolicyModel.create({
      chargeType: dto.chargeType,
      currency: dto.currency,
      graceDays: dto.graceDays,
      dailyRateMinorUnits: dto.dailyRateMinorUnits,
      capMinorUnits: dto.capMinorUnits,
      effectiveFrom,
      effectiveTo: null,
      isActive: true,
      createdBy,
    });
  }

  async getEffectivePolicy(
    chargeType: ChargeType,
    currency: string,
    asOf: Date,
  ): Promise<ChargePolicyDocument> {
    const policy = await this.chargePolicyModel
      .findOne({
        chargeType,
        currency,
        isActive: true,
        effectiveFrom: { $lte: asOf },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gt: asOf } }],
      })
      .sort({ effectiveFrom: -1 })
      .exec();

    if (!policy) {
      throw new BusinessRuleException(
        `No effective ${chargeType} policy for currency ${currency} as of ${asOf.toISOString()}`,
        ErrorCode.BIZ_NO_EFFECTIVE_POLICY,
      );
    }

    return policy;
  }

  async listPolicies(chargeType?: ChargeType): Promise<ChargePolicyDocument[]> {
    const filter = chargeType ? { chargeType } : {};
    return this.chargePolicyModel
      .find(filter)
      .sort({ effectiveFrom: -1 })
      .exec();
  }
}
