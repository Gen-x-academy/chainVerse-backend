import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

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

    const jwtSecret = this.configService.get<string>('jwtSecret') ?? '';

    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Malformed token');

      const [header, body, sig] = parts;
      const expected = crypto
        .createHmac('sha256', jwtSecret)
        .update(`${header}.${body}`)
        .digest('base64url');

      if (sig !== expected) throw new Error('Invalid signature');

      const payload = JSON.parse(
        Buffer.from(body, 'base64url').toString(),
      ) as Record<string, unknown>;

      if ((payload.exp as number) < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
      }

      // Refresh tokens must not be used for authentication
      if (payload.type === 'refresh') {
        throw new Error('Refresh tokens cannot be used for authentication');
      }

      // All identity and role claims must be present in the token itself
      if (
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        typeof payload.email !== 'string' ||
        !payload.email ||
        typeof payload.role !== 'string' ||
        !payload.role
      ) {
        throw new Error('Token is missing required claims');
      }

      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid token';
      throw new UnauthorizedException(message);
    }
  }
}
