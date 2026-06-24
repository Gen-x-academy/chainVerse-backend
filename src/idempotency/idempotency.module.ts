import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  IdempotencyKey,
  IdempotencyKeySchema,
} from './schemas/idempotency-key.schema';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

/**
 * Provides idempotency support for sensitive write endpoints.
 *
 * Import this module in any feature module that needs idempotent endpoints,
 * then decorate the relevant controller methods with `@Idempotent()` and
 * register `IdempotencyInterceptor` (either as a provider or via APP_INTERCEPTOR).
 *
 * Storage & expiry:
 * - Idempotency records are stored in MongoDB.
 * - A TTL index on `expiresAt` removes records after 24 hours.
 * - After expiry the same key can be reused without replaying the old response.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IdempotencyKey.name, schema: IdempotencyKeySchema },
    ]),
  ],
  providers: [IdempotencyService, IdempotencyInterceptor],
  exports: [IdempotencyService, IdempotencyInterceptor],
})
export class IdempotencyModule {}
