import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BorrowerPreference,
  BorrowerPreferenceDocument,
} from '../schemas/borrower-preference.schema';
import { UpsertBorrowerPreferenceDto } from '../dto/upsert-borrower-preference.dto';

@Injectable()
export class BorrowerPreferenceService {
  constructor(
    @InjectModel(BorrowerPreference.name)
    private readonly prefModel: Model<BorrowerPreferenceDocument>,
  ) {}

  async getPreferences(patronId: string): Promise<BorrowerPreferenceDocument | null> {
    return this.prefModel.findOne({ patronId }).exec();
  }

  async upsert(
    patronId: string,
    dto: UpsertBorrowerPreferenceDto,
  ): Promise<BorrowerPreferenceDocument> {
    const set: Record<string, unknown> = {};
    if (dto.emailReminders !== undefined) set.emailReminders = dto.emailReminders;
    if (dto.inAppReminders !== undefined) set.inAppReminders = dto.inAppReminders;
    if (dto.quietHoursStart !== undefined) set.quietHoursStart = dto.quietHoursStart;
    if (dto.quietHoursEnd !== undefined) set.quietHoursEnd = dto.quietHoursEnd;
    if (dto.locale !== undefined) set.locale = dto.locale;
    if (dto.timezone !== undefined) set.timezone = dto.timezone;
    if (dto.optOutMandatoryNotices !== undefined)
      set.optOutMandatoryNotices = dto.optOutMandatoryNotices;

    return this.prefModel.findOneAndUpdate(
      { patronId },
      { $set: set, $setOnInsert: { patronId } },
      { new: true, upsert: true },
    );
  }
}
