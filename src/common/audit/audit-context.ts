import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Everything about the caller that an audit entry needs, resolved once per
 * request from the authenticated principal and the correlation headers.
 */
export interface AuditContext {
  actorId: string;
  actorEmail: string | null;
  actorRole: string | null;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

interface AuditableRequest {
  user?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/**
 * Builds an {@link AuditContext} from an HTTP request. Missing identity is
 * represented as `anonymous` rather than throwing — an unauthenticated
 * privileged attempt is exactly the kind of event worth recording.
 */
export function resolveAuditContext(request: AuditableRequest): AuditContext {
  const user = request?.user ?? {};
  const headers = request?.headers ?? {};

  return {
    actorId: asString(user['sub']) ?? asString(user['id']) ?? 'anonymous',
    actorEmail: asString(user['email']),
    actorRole: asString(user['role']),
    requestId: asString(headers['x-request-id']) ?? 'unknown',
    ip: asString(request?.ip) ?? asString(request?.socket?.remoteAddress),
    userAgent: asString(headers['user-agent']),
  };
}

/**
 * Injects the resolved {@link AuditContext} into a controller handler:
 *
 * ```ts
 * update(@Param('id') id: string, @AuditActor() audit: AuditContext) { … }
 * ```
 */
export const AuditActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuditContext =>
    resolveAuditContext(ctx.switchToHttp().getRequest()),
);

/** Context used by background jobs and other non-HTTP callers. */
export function systemAuditContext(
  requestId = 'system',
  actorId = 'system',
): AuditContext {
  return {
    actorId,
    actorEmail: null,
    actorRole: 'system',
    requestId,
    ip: null,
    userAgent: null,
  };
}
