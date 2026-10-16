import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import {
  BusinessRuleException,
  ErrorCode,
  ResourceNotFoundException,
} from '../../common/errors';
import {
  ReconciliationAlertPayload,
  ScholarshipFinanceEvents,
} from '../scholarship-finance.events';
import {
  AlertStatus,
  Discrepancy,
  ReconciliationAlert,
  ReconciliationAlertDocument,
} from './reconciliation.schemas';

@Injectable()
export class ReconciliationAlertsService {
  private readonly logger = new Logger(ReconciliationAlertsService.name);

  constructor(
    @InjectModel(ReconciliationAlert.name)
    private readonly alertModel: Model<ReconciliationAlertDocument>,
    private readonly events: EventEmitter2,
  ) {}

  /** Opens an alert, or refreshes the active alert of the same type. */
  async raise(
    organizationId: string,
    programId: string,
    discrepancy: Discrepancy,
    runId?: string,
  ): Promise<ReconciliationAlertDocument> {
    const now = new Date();
    const activeKey = `${programId}:${discrepancy.type}`;
    const upsert = () =>
      this.alertModel
        .findOneAndUpdate(
          { activeKey },
          {
            $setOnInsert: {
              organizationId,
              programId,
              type: discrepancy.type,
              status: 'open',
              firstRunId: runId,
              firstSeenAt: now,
            },
            $set: {
              severity: discrepancy.severity,
              blocksObligations: discrepancy.severity === 'critical',
              message: discrepancy.message,
              details: discrepancy.details,
              lastRunId: runId,
              lastSeenAt: now,
            },
            $inc: { occurrences: 1 },
          },
          { upsert: true, returnDocument: 'after' },
        )
        .exec();
    // Two concurrent runs may both try to insert; the unique activeKey index
    // lets exactly one win and the other then updates it.
    let alert: ReconciliationAlertDocument;
    try {
      alert = await upsert();
    } catch (err: unknown) {
      if ((err as { code?: number }).code !== 11000) throw err;
      alert = await upsert();
    }

    if (alert.occurrences === 1) {
      this.logger.error(
        `[ALERT] ${discrepancy.severity} ${discrepancy.type} on program ${programId}: ${discrepancy.message}`,
      );
      const payload: ReconciliationAlertPayload = {
        organizationId,
        programId,
        alertId: alert.id,
        type: discrepancy.type,
        severity: discrepancy.severity,
        message: discrepancy.message,
      };
      this.events.emit(
        ScholarshipFinanceEvents.RECONCILIATION_ALERT_RAISED,
        payload,
      );
    }
    return alert;
  }

  findBlocking(programId: string) {
    return this.alertModel
      .find({
        programId,
        blocksObligations: true,
        status: { $in: ['open', 'acknowledged'] },
      })
      .lean()
      .exec();
  }

  list(
    organizationId: string,
    filter: { programId?: string; status?: AlertStatus },
  ) {
    const q: Record<string, unknown> = { organizationId };
    if (filter.programId) q.programId = filter.programId;
    if (filter.status) q.status = filter.status;
    return this.alertModel
      .find(q)
      .sort({ lastSeenAt: -1 })
      .limit(200)
      .lean()
      .exec();
  }

  async acknowledge(organizationId: string, alertId: string, userId: string) {
    const alert = await this.get(organizationId, alertId);
    if (alert.status !== 'open') {
      throw new BusinessRuleException(
        `Alert is already ${alert.status}`,
        ErrorCode.BIZ_RECONCILIATION_BLOCKED,
      );
    }
    alert.status = 'acknowledged';
    alert.acknowledgedBy = userId;
    alert.acknowledgedAt = new Date();
    return alert.save();
  }

  /**
   * Records the operator's resolution. The ledger is not modified — any
   * correction must be posted separately as an adjustment or reversal.
   */
  async resolve(
    organizationId: string,
    alertId: string,
    userId: string,
    note: string,
  ) {
    const alert = await this.get(organizationId, alertId);
    if (alert.status === 'resolved') {
      throw new BusinessRuleException(
        'Alert is already resolved',
        ErrorCode.BIZ_RECONCILIATION_BLOCKED,
      );
    }
    alert.status = 'resolved';
    alert.resolvedBy = userId;
    alert.resolvedAt = new Date();
    alert.resolutionNote = note;
    alert.activeKey = undefined;
    return alert.save();
  }

  private async get(organizationId: string, alertId: string) {
    const alert = isValidObjectId(alertId)
      ? await this.alertModel.findOne({ _id: alertId, organizationId }).exec()
      : null;
    if (!alert) {
      throw new ResourceNotFoundException(
        'Alert not found',
        ErrorCode.RES_RECONCILIATION_NOT_FOUND,
      );
    }
    return alert;
  }
}
