import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DisbursementLock,
  DisbursementLockDocument,
} from '../schemas/disbursement-run.schema';
import { isDuplicateKey } from './scholarship-asset.service';

/** Mongo-backed mutex; see {@link DisbursementLock}. */
@Injectable()
export class DisbursementLockService {
  constructor(
    @InjectModel(DisbursementLock.name)
    private readonly lockModel: Model<DisbursementLockDocument>,
  ) {}

  /** True when `holder` now owns `name` for `ttlMs`. */
  async acquire(name: string, holder: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    try {
      // Matches only a missing or expired lock; a live lock makes the upsert
      // collide on `_id`, which is the "already held" signal.
      await this.lockModel
        .findOneAndUpdate(
          { _id: name, until: { $lt: now } },
          { $set: { holder, until: new Date(now.getTime() + ttlMs) } },
          { upsert: true, new: true },
        )
        .exec();
      return true;
    } catch (err) {
      if (isDuplicateKey(err)) return false;
      throw err;
    }
  }

  async release(name: string, holder: string): Promise<void> {
    await this.lockModel.deleteOne({ _id: name, holder }).exec();
  }
}
