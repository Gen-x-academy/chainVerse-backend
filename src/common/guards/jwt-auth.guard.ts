import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Token not provided');
    }

    try {
      const payload = this.jwtService.verify<Record<string, unknown>>(token, {
        secret: this.configService.get<string>('jwtSecret'),
      });

      // Refresh tokens must not be used for authentication
      if (payload['type'] === 'refresh') {
        throw new Error('Refresh tokens cannot be used for authentication');
      }

      // All identity and role claims must be present
      if (
        typeof payload['sub'] !== 'string' ||
        !payload['sub'] ||
        typeof payload['email'] !== 'string' ||
        !payload['email'] ||
        typeof payload['role'] !== 'string' ||
        !payload['role']
      ) {
        throw new Error('Token is missing required claims');
      }

      request.user = {
        sub: payload['sub'],
        id: payload['sub'],
        email: payload['email'],
        role: payload['role'],
      };
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid token';
      throw new UnauthorizedException(message);
    }
  }
}
