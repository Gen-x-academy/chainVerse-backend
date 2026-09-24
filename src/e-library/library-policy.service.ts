import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GLOBAL_LIBRARY_POLICY_SCOPE,
  LibraryPolicy,
  LibraryPolicyDocument,
} from './schemas/library-policy.schema';
import { UpdateLibraryPolicyDto } from './dto/update-library-policy.dto';

@Injectable()
export class LibraryPolicyService {
  constructor(
    @InjectModel(LibraryPolicy.name)
    private readonly policyModel: Model<LibraryPolicyDocument>,
  ) {}

  /** Returns the live policy, creating the default singleton on first use. */
  async getPolicy(): Promise<LibraryPolicyDocument> {
    const policy = await this.policyModel.findOneAndUpdate(
      { scope: GLOBAL_LIBRARY_POLICY_SCOPE },
      { $setOnInsert: { scope: GLOBAL_LIBRARY_POLICY_SCOPE } },
      { new: true, upsert: true },
    );
    return policy;
  }

  async updatePolicy(
    dto: UpdateLibraryPolicyDto,
  ): Promise<LibraryPolicyDocument> {
    await this.getPolicy();
    const updated = await this.policyModel.findOneAndUpdate(
      { scope: GLOBAL_LIBRARY_POLICY_SCOPE },
      { $set: dto, $inc: { version: 1 } },
      { new: true },
    );
    return updated as LibraryPolicyDocument;
  }
}
