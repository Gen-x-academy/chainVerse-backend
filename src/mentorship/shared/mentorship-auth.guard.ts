import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  AuthException,
  DomainException,
  ErrorCode,
  ForbiddenDomainException,
} from '../../common/errors';
import {
  MENTORSHIP_POLICY_KEY,
  MentorshipPolicyMetadata,
} from './mentorship-policy.decorator';
import { MentorshipTelemetry } from './mentorship-telemetry.service';

/**
 * Deny-by-default guard for every mentorship route.
 *
 * 1. Rejects handlers that do not declare `@MentorshipPolicy()`.
 * 2. Rejects requests while the `MENTORSHIP_ENABLED` kill switch is off.
 * 3. Authenticates the bearer token (delegates to JwtAuthGuard).
 * 4. Checks the caller's platform role against the policy.
 *
 * Program/application scoping (owner, scoped reviewer, applicant) is enforced
 * by MentorshipAccessPolicy inside the services, because it needs data.
 */
@Injectable()
export class MentorshipAuthGuard implements CanActivate {
  private readonly jwtGuard: JwtAuthGuard;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly telemetry: MentorshipTelemetry,
  ) {
    this.jwtGuard = new JwtAuthGuard(configService);
  }

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<MentorshipPolicyMetadata | undefined>(
      MENTORSHIP_POLICY_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!policy || !Array.isArray(policy.roles) || policy.roles.length === 0) {
      this.telemetry.count('mentorship_authz_denied_total', { reason: 'policy_missing' });
      throw new ForbiddenDomainException(
        'This endpoint has no access policy and is denied by default',
        ErrorCode.MENTOR_POLICY_MISSING,
      );
    }

    if (this.configService.get<boolean>('mentorship.enabled') === false) {
      throw new DomainException(
        'Mentorship applications are temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.SYS_SERVICE_UNAVAILABLE,
      );
    }

    try {
      this.jwtGuard.canActivate(context);
    } catch (err) {
      this.telemetry.count('mentorship_authz_denied_total', { reason: 'unauthenticated' });
      const message = err instanceof UnauthorizedException ? err.message : 'Invalid token';
      throw new AuthException(message, ErrorCode.AUTH_INVALID_TOKEN);
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role || !policy.roles.includes(user.role)) {
      this.telemetry.count('mentorship_authz_denied_total', {
        reason: 'role',
        action: policy.action,
      });
      throw new ForbiddenDomainException(
        'Your role is not permitted to perform this action',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }

    return true;
  }
}
