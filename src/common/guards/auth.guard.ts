import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Simple simulation of authentication check
    const user = request.user || { role: 'admin' }; // Hardcoded admin for testing
    if (!user) throw new UnauthorizedException();

    request.user = user;
    return true;
  }
}
