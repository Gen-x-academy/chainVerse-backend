import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhookVerificationService } from './webhook-verification.service';
import { WebhookLogService } from './webhook-log.service';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import {
  WebhookLog,
  WebhookLogSchema,
} from './schemas/webhook-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookLog.name, schema: WebhookLogSchema },
    ]),
  ],
  providers: [
    WebhookVerificationService,
    WebhookLogService,
    WebhookSignatureGuard,
  ],
  exports: [
    WebhookVerificationService,
    WebhookLogService,
    WebhookSignatureGuard,
  ],
})
export class WebhookSecurityModule {}
