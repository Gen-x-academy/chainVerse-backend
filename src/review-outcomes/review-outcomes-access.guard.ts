import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class ReviewOutcomesAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: Record<string, unknown>;
    }>();
    const user = request.user;
    if (
      !user ||
      typeof user['sub'] !== 'string' ||
      !user['sub'] ||
      typeof user['tenantId'] !== 'string' ||
      !user['tenantId'] ||
      !Array.isArray(user['roles']) ||
      user['roles'].length === 0
    ) {
      throw new ForbiddenException('REVIEW_OUTCOMES_ACCESS_DENIED');
    }
    return true;
  }
}
