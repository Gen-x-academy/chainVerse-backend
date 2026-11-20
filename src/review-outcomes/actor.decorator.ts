import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ActorContext } from './review-outcomes.types';

export const Actor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActorContext => {
    const request = context.switchToHttp().getRequest<{
      user?: Record<string, unknown>;
    }>();
    const user = request.user ?? {};
    const roles = Array.isArray(user['roles'])
      ? user['roles'].map((role) => String(role))
      : [];
    return {
      tenantId: typeof user['tenantId'] === 'string' ? user['tenantId'] : '',
      actorId:
        typeof user['sub'] === 'string'
          ? user['sub']
          : typeof user['id'] === 'string'
            ? user['id']
            : '',
      roles,
    };
  },
);
