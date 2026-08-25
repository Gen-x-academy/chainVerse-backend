import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BorrowerLibraryPreference,
  BorrowerLibraryPreferenceDocument,
} from './schemas/borrower-library-preference.schema';
import { UpsertBorrowerPreferenceDto } from './dto/upsert-borrower-preference.dto';

@Injectable()
export class BorrowerPreferencesService {
  constructor(
    @InjectModel(BorrowerLibraryPreference.name)
    private readonly prefModel: Model<BorrowerLibraryPreferenceDocument>,
  ) {}

  /** Return preferences for a patron, creating defaults if none exist yet. */
  async findOrCreate(patronId: string): Promise<BorrowerLibraryPreference> {
    const existing = await this.prefModel.findOne({ patronId }).exec();
    if (existing) return existing;
    return this.prefModel.create({ patronId });
  }

  /** Get a patron's preferences; throws 404 when not found. */
  async findByPatron(patronId: string): Promise<BorrowerLibraryPreference> {
    const pref = await this.prefModel.findOne({ patronId }).exec();
    if (!pref) throw new NotFoundException('Preferences not found');
    return pref;
  }

  /** Create or update a patron's preferences (owner-scoped upsert). */
  async upsert(
    patronId: string,
    dto: UpsertBorrowerPreferenceDto,
  ): Promise<BorrowerLibraryPreference> {
    const pref = await this.prefModel
      .findOneAndUpdate({ patronId }, { ...dto }, { new: true, upsert: true })
      .exec();
    return pref!;
  }
}