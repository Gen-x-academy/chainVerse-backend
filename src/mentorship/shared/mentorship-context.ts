import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { Role } from '../../common/enums/role.enum';

/** Identity attached to the request by MentorshipAuthGuard (via JwtAuthGuard). */
export interface MentorshipUser {
  id: string;
  email: string;
  role: Role | string;
}

/** Per-request context handed from controllers to services for policy + audit. */
export interface MentorshipRequestContext {
  user: MentorshipUser;
  requestId?: string;
}

/**
 * Resolves the authenticated user and request id for mentorship handlers.
 *
 * Only usable behind MentorshipAuthGuard, which guarantees `request.user`.
 */
export const MentorshipCtx = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MentorshipRequestContext => {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user: MentorshipUser }>();
    return {
      user: req.user,
      requestId: req.headers['x-request-id'] as string | undefined,
    };
  },
);
