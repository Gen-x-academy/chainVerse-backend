import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ErrorCode, ForbiddenDomainException } from '../../common/errors';
import { Role } from '../../common/enums/role.enum';

/** Allows only platform admins (e.g. the custody signer's service token). */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: string } }>();
    if (user?.role !== (Role.ADMIN as string)) {
      throw new ForbiddenDomainException(
        'Platform admin access required',
        ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      );
    }
    return true;
  }
}
