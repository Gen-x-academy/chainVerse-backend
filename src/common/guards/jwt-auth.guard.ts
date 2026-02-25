import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || '';

@Injectable()
export class JwtAuthGuard implements CanActivate {
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
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Malformed token');

      const [header, body, sig] = parts;
      const expected = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${header}.${body}`)
        .digest('base64url');

      if (sig !== expected) throw new Error('Invalid signature');

      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
      }

      request.user = { id: payload.sub, email: payload.email, role: payload.role };
      return true;
    } catch (err: any) {
      throw new UnauthorizedException(err.message || 'Invalid token');
    }
  }
}
