import { createHash, timingSafeEqual } from 'crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthException } from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

export const AUTOMATION_TOKEN_HEADER = 'x-automation-token';

/**
 * Admits only automation holding SCHOLARSHIP_AUTOMATION_TOKEN. User JWTs —
 * including platform admins — cannot trigger payouts. Fails closed: when the
 * token is not configured every request is rejected.
 */
@Injectable()
export class AutomationTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('scholarships.automationToken');
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, unknown>;
      user?: unknown;
    }>();
    const presented = request.headers?.[AUTOMATION_TOKEN_HEADER];

    if (
      !expected ||
      typeof presented !== 'string' ||
      !constantTimeEquals(presented, expected)
    ) {
      throw new AuthException(
        'Valid automation credentials are required',
        ErrorCode.AUTH_AUTOMATION_TOKEN_INVALID,
      );
    }

    request.user = { sub: 'scholarship-automation', role: 'automation' };
    return true;
  }
}

/** Hash both sides so length differences do not leak through timing. */
function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
