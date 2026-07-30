import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  IdempotencyKey,
  IdempotencyKeyDocument,
} from './schemas/idempotency-key.schema';

/** Default TTL for idempotency records: 24 hours. */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedResponse {
  statusCode: number;
  responseBody: Record<string, unknown>;
}

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectModel(IdempotencyKey.name)
    private readonly idempotencyModel: Model<IdempotencyKeyDocument>,
  ) {}

  /**
   * Looks up a previously cached response by idempotency key + userId.
   * Returns `null` when no matching record exists (first-time request).
   */
  async find(key: string, userId: string): Promise<CachedResponse | null> {
    const record = await this.idempotencyModel.findOne({ key, userId }).lean();
    if (!record) return null;
    return { statusCode: record.statusCode, responseBody: record.responseBody };
  }

  /**
   * Saves the response of a successfully processed request so subsequent
   * requests with the same key can receive the cached result.
   */
  async save(
    key: string,
    userId: string,
    path: string,
    statusCode: number,
    responseBody: Record<string, unknown>,
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.idempotencyModel.updateOne(
      { key, userId },
      {
        $setOnInsert: {
          key,
          userId,
          path,
          statusCode,
          responseBody,
          expiresAt,
        },
      },
      { upsert: true },
    );
  }
}
