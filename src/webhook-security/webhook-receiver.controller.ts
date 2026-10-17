import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhookLogService } from './webhook-log.service';

type WebhookRequest = Request & {
  webhookMeta?: { webhookId: string; source: string; eventType: string };
};

@ApiTags('Webhooks')
@Controller('webhooks')
@Public()
@UseGuards(WebhookSignatureGuard)
export class WebhookReceiverController {
  constructor(
    private readonly logs: WebhookLogService,
    private readonly events: EventEmitter2,
  ) {}

  @Post(':source')
  @ApiOperation({ summary: 'Receive a signed webhook event' })
  async receive(@Param('source') source: string, @Req() request: WebhookRequest, @Body() body: unknown) {
    const meta = request.webhookMeta ?? {
      webhookId: request.headers['x-webhook-id'] as string,
      source,
      eventType: request.headers['x-webhook-event'] as string,
    };
    await this.logs.logReceived({
      webhookId: meta.webhookId,
      source: meta.source || source,
      eventType: meta.eventType,
      metadata: { accepted: true },
    });
    this.events.emit('webhook.received', { ...meta, body });
    return { accepted: true, webhookId: meta.webhookId };
  }
}
