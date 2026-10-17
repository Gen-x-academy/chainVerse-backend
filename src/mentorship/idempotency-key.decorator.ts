import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { ErrorCode } from '../common/errors/error-codes.enum';

export const IDEMPOTENCY_HEADER = 'x-idempotency-key';
const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;

/**
 * Reads and validates the `X-Idempotency-Key` header for mentorship writes.
 *
 * Unlike the global `@Idempotent()` response cache, mentorship keys are
 * stored on the records they create (application / decision), so a retry is
 * answered from the source of truth rather than from a 24h cache.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const value = request.headers?.[IDEMPOTENCY_HEADER];
    if (typeof value !== 'string' || value.length === 0) {
      throw new BadRequestException({
        message: 'X-Idempotency-Key header is required for this endpoint',
        errorCode: ErrorCode.VAL_IDEMPOTENCY_KEY_MISSING,
      });
    }
    if (!KEY_PATTERN.test(value)) {
      throw new BadRequestException({
        message:
          'X-Idempotency-Key must be 8-128 characters of letters, digits, "-", "_", ":" or "."',
        errorCode: ErrorCode.VAL_INVALID_FORMAT,
      });
    }
    return value;
  },
);
