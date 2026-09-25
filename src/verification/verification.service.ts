import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FlattenMaps } from 'mongoose';
import {
  VerificationResult,
  VerificationRequest,
  VerificationStatus,
  VerificationLog,
  VerificationStats,
} from './interfaces/verification.interface';
import {
  VerificationLogDocument,
  VerificationLogModel,
} from './schemas/verification-log.schema';

/**
 * Verification Service
 *
 * Provides an append-only audit trail for ticket scan attempts.
 * Persists every verification attempt to MongoDB regardless of outcome.
 * This service is self-contained — it does not depend on a tickets or
 * events module; callers are responsible for supplying pre-validated data.
 */
@Injectable()
export class VerificationService {
  constructor(
    @InjectModel(VerificationLogModel.name)
    private readonly logModel: Model<VerificationLogDocument>,
  ) {}

  // ---------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------

  /**
   * Record a verification attempt and return the result.
   * The caller (controller / integration) is responsible for
   * evaluating business rules; this service only persists the log.
   */
  async logVerification(
    request: VerificationRequest & {
      status: VerificationStatus;
      message: string;
      ticketId?: string | null;
    },
  ): Promise<VerificationResult> {
    const {
      ticketCode,
      eventId = 'unknown',
      verifierId = null,
      status,
      message,
      ticketId = null,
    } = request;

    await this.logModel.create({
      ticketCode,
      eventId,
      verifierId,
      status,
      message,
      ticketId,
    });

    return {
      status,
      isValid: status === VerificationStatus.VALID,
      message,
      ticketCode,
      eventId,
      verifiedAt: new Date(),
      verifiedBy: verifierId,
    };
  }

  /**
   * Convenience wrapper: record a VALID scan.
   */
  async verifyTicket(
    request: VerificationRequest,
  ): Promise<VerificationResult> {
    return this.logVerification({
      ...request,
      status: VerificationStatus.VALID,
      message: this.getStatusMessage(VerificationStatus.VALID),
    });
  }

  /**
   * Convenience wrapper: record an INVALID scan.
   */
  async invalidate(request: VerificationRequest): Promise<VerificationResult> {
    return this.logVerification({
      ...request,
      status: VerificationStatus.INVALID,
      message: this.getStatusMessage(VerificationStatus.INVALID),
    });
  }

  // ---------------------------------------------------------------
  // Log retrieval
  // ---------------------------------------------------------------

  /**
   * Returns all scan attempts for an event, newest-first.
   */
  async getLogsForEvent(eventId: string): Promise<VerificationLog[]> {
    const docs = await this.logModel
      .find({ eventId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return docs.map((d) => this.toLog(d));
  }

  /**
   * Returns all scan attempts for a specific ticket code, newest-first.
   */
  async getLogsForTicket(ticketCode: string): Promise<VerificationLog[]> {
    const docs = await this.logModel
      .find({ ticketCode })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return docs.map((d) => this.toLog(d));
  }

  // ---------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------

  /**
   * Aggregates attempt counts grouped by status for a given event.
   */
  async getStatsForEvent(eventId: string): Promise<VerificationStats> {
    const allStatuses = Object.values(VerificationStatus);
    const seed = allStatuses.reduce(
      (acc, s) => ({ ...acc, [s]: 0 }),
      {} as Record<VerificationStatus, number>,
    );

    const rows: { _id: VerificationStatus; count: number }[] =
      await this.logModel.aggregate([
        { $match: { eventId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

    let total = 0;
    for (const row of rows) {
      seed[row._id] = row.count;
      total += row.count;
    }

    return {
      eventId,
      total,
      valid: seed[VerificationStatus.VALID],
      invalid: seed[VerificationStatus.INVALID],
      alreadyUsed: seed[VerificationStatus.ALREADY_USED],
      byStatus: seed,
    };
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  getStatusMessage(status: VerificationStatus): string {
    const messages: Record<VerificationStatus, string> = {
      [VerificationStatus.VALID]: 'Ticket is valid. Entry permitted.',
      [VerificationStatus.INVALID]: 'Invalid ticket. Entry denied.',
      [VerificationStatus.ALREADY_USED]:
        'Ticket has already been used. Entry denied.',
      [VerificationStatus.CANCELLED]:
        'Ticket has been cancelled. Entry denied.',
      [VerificationStatus.EXPIRED]: 'Ticket has expired. Entry denied.',
      [VerificationStatus.EVENT_NOT_STARTED]:
        'Event has not started yet. Please wait.',
      [VerificationStatus.EVENT_ENDED]:
        'Event has ended. Entry no longer permitted.',
    };

    return messages[status] ?? 'Unknown verification status.';
  }

  private toLog(
    doc: FlattenMaps<VerificationLogModel> & { _id: unknown; createdAt?: Date },
  ): VerificationLog {
    return {
      id: String((doc['_id'] as { toString(): string }).toString()),
      ticketCode: doc['ticketCode'],
      ticketId: doc['ticketId'] ?? null,
      eventId: doc['eventId'],
      status: doc['status'],
      verifierId: doc['verifierId'] ?? null,
      message: doc['message'],
      createdAt: doc['createdAt'] as Date,
    };
  }
}
