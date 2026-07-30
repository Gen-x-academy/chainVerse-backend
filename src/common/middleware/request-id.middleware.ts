import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * Ensures every request carries a unique correlation ID.
 *
 * - If the client provides an `X-Request-Id` header it is reused, allowing
 *   callers to trace requests across service boundaries.
 * - Otherwise a UUID v4 is generated.
 * - The resolved ID is echoed back in the `X-Request-Id` response header so
 *   clients can correlate their calls with log entries.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    req.headers['x-request-id'] = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}
