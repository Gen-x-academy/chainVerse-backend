import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IdempotencyKey, IdempotencyKeyDocument } from './schemas/idempotency-key.schema';

/** Default TTL for idempotency records: 24 hours. */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedResponse {
  statusCode: number;
  responseBody: Record<string, unknown>;
}

export enum IdempotencyCheckStatus {
  /** No prior record – the handler should run normally. */
  NEW = 'new',
  /** Same actor + endpoint + key + payload – replay the cached response. */
  REPLAY = 'replay',
  /** Same actor + endpoint + key but a different payload – reject with 409. */
  CONFLICT = 'conflict',
}

export interface IdempotencyCheckResult {
  status: IdempotencyCheckStatus;
  cached?: CachedResponse;
}

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectModel(IdempotencyKey.name)
    private readonly idempotencyModel: Model<IdempotencyKeyDocument>,
  ) {}

  /**
   * Looks up a previously cached response by idempotency key + userId + path.
   *
   * - No record found            -> NEW: the handler should run normally.
   * - Record found, hash matches -> REPLAY: return the cached response.
   * - Record found, hash differs -> CONFLICT: same key reused for a
   *   different request; the caller must pick a new key.
   */
  async check(
    key: string,
    userId: string,
    path: string,
    requestHash: string,
  ): Promise<IdempotencyCheckResult> {
    const record = await this.idempotencyModel.findOne({ key, userId, path }).lean();
    if (!record) return { status: IdempotencyCheckStatus.NEW };

    if (record.requestHash !== requestHash) {
      return { status: IdempotencyCheckStatus.CONFLICT };
    }

    return {
      status: IdempotencyCheckStatus.REPLAY,
      cached: { statusCode: record.statusCode, responseBody: record.responseBody },
    };
  }

  /**
   * Saves the response of a successfully processed request so subsequent
   * requests with the same key + payload can receive the cached result.
   */
  async save(
    key: string,
    userId: string,
    path: string,
    requestHash: string,
    statusCode: number,
    responseBody: Record<string, unknown>,
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.idempotencyModel.updateOne(
      { key, userId, path },
      {
        $setOnInsert: {
          key,
          userId,
          path,
          requestHash,
          statusCode,
          responseBody,
          expiresAt,
        },
      },
      { upsert: true },
    );
  }
}
