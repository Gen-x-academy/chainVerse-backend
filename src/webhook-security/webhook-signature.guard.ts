import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookVerificationService } from './webhook-verification.service';
import { WebhookLogService } from './webhook-log.service';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(
    private readonly verificationService: WebhookVerificationService,
    private readonly webhookLogService: WebhookLogService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const signatureHeader =
      (request.headers['x-webhook-signature'] as string) ??
      (request.headers['x-hub-signature-256'] as string);
    const timestampHeader = request.headers['x-webhook-timestamp'] as string;
    const nonceHeader = request.headers['x-webhook-nonce'] as string;
    const webhookId =
      (request.headers['x-webhook-id'] as string) ??
      `wh_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const source =
      (request.headers['x-webhook-source'] as string) ?? 'unknown';
    const eventType =
      (request.headers['x-webhook-event'] as string) ?? 'unknown';

    let body: string;
    if (typeof request.body === 'string') {
      body = request.body;
    } else {
      body = JSON.stringify(request.body ?? {});
    }

    try {
      this.verificationService.verifyWebhook(
        body,
        signatureHeader,
        timestampHeader,
        nonceHeader,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed';

      if (message.includes('Invalid webhook signature')) {
        await this.webhookLogService
          .logRejectedSignature(webhookId, source, eventType)
          .catch((logErr) =>
            this.logger.error('Failed to log rejected signature', logErr),
          );
      } else if (message.includes('Webhook replay detected')) {
        await this.webhookLogService
          .logRejectedReplay(webhookId, source, eventType)
          .catch((logErr) =>
            this.logger.error('Failed to log rejected replay', logErr),
          );
      }

      throw err;
    }

    // Attach webhook metadata to request for downstream handlers
    (request as Record<string, unknown>).webhookMeta = {
      webhookId,
      source,
      eventType,
    };

    return true;
  }
}
