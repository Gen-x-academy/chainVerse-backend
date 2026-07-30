import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Restricts access to internal/localhost callers only.
 * Apply this guard to any endpoint that must not be publicly reachable
 * (e.g. /metrics, /metrics/prometheus).
 *
 * In a containerised deployment, expose the metrics port only on the
 * internal network so this guard acts as a defence-in-depth layer.
 */
@Injectable()
export class InternalOnlyGuard implements CanActivate {
  private static readonly LOOPBACK = new Set([
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
  ]);

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? req.socket?.remoteAddress ?? '';

    if (InternalOnlyGuard.LOOPBACK.has(ip)) {
      return true;
    }

    throw new ForbiddenException(
      'Metrics endpoint is restricted to internal access only',
    );
  }
}
