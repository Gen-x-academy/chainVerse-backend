import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WebhookLog,
  WebhookLogDocument,
  WebhookLogStatus,
} from './schemas/webhook-log.schema';

@Injectable()
export class WebhookLogService {
  constructor(
    @InjectModel(WebhookLog.name)
    private readonly webhookLogModel: Model<WebhookLogDocument>,
  ) {}

  async logReceived(input: {
    webhookId: string;
    source: string;
    eventType: string;
    metadata?: Record<string, unknown>;
  }): Promise<WebhookLogDocument> {
    return new this.webhookLogModel({
      ...input,
      receivedAt: new Date(),
      status: WebhookLogStatus.RECEIVED,
    }).save();
  }

  async logVerified(webhookId: string): Promise<void> {
    await this.webhookLogModel
      .findOneAndUpdate(
        { webhookId },
        { status: WebhookLogStatus.VERIFIED },
      )
      .exec();
  }

  async logProcessed(webhookId: string): Promise<void> {
    await this.webhookLogModel
      .findOneAndUpdate(
        { webhookId },
        {
          status: WebhookLogStatus.PROCESSED,
          processedAt: new Date(),
        },
      )
      .exec();
  }

  async logFailed(webhookId: string, error: string): Promise<void> {
    await this.webhookLogModel
      .findOneAndUpdate(
        { webhookId },
        {
          status: WebhookLogStatus.FAILED,
          error,
          processedAt: new Date(),
        },
      )
      .exec();
  }

  async logRejectedSignature(
    webhookId: string,
    source: string,
    eventType: string,
  ): Promise<void> {
    await new this.webhookLogModel({
      webhookId,
      source,
      eventType,
      receivedAt: new Date(),
      status: WebhookLogStatus.REJECTED_SIGNATURE,
      processedAt: new Date(),
    }).save();
  }

  async logRejectedReplay(
    webhookId: string,
    source: string,
    eventType: string,
  ): Promise<void> {
    await new this.webhookLogModel({
      webhookId,
      source,
      eventType,
      receivedAt: new Date(),
      status: WebhookLogStatus.REJECTED_REPLAY,
      processedAt: new Date(),
    }).save();
  }
}
