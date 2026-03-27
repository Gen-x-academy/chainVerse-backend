import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent';

/**
 * Mark a controller method as idempotent.
 *
 * When applied, the IdempotencyInterceptor will:
 * 1. Return the cached response if the same `X-Idempotency-Key` + userId was
 *    seen before.
 * 2. Cache the response once the handler completes.
 *
 * @example
 * \@Post('enroll')
 * \@Idempotent()
 * enroll(@Body() dto: EnrollDto) { ... }
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
