import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, switchMap, tap } from 'rxjs';
import { Request, Response } from 'express';
import { IdempotencyService } from './idempotency.service';
import { IDEMPOTENT_KEY } from './decorators/idempotent.decorator';
import { ErrorCode } from '../common/errors/error-codes.enum';

/**
 * Intercepts requests on endpoints decorated with `@Idempotent()`.
 *
 * Flow:
 * 1. Require the `X-Idempotency-Key` header (400 if missing).
 * 2. Require an authenticated user on the request (`request.user.id`).
 * 3. If a cached response exists for key+userId, replay it immediately.
 * 4. Otherwise let the handler run and cache its response.
 *
 * Storage & expiry:
 * - Records are stored in MongoDB with a 24-hour TTL index.
 * - After expiry the key can be reused freely.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(
      IDEMPOTENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isIdempotent) return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { id: string } }>();
    const res = http.getResponse<Response>();

    const idempotencyKey = req.headers['x-idempotency-key'] as
      | string
      | undefined;

    if (!idempotencyKey) {
      throw new BadRequestException({
        message: 'X-Idempotency-Key header is required for this endpoint',
        errorCode: ErrorCode.VAL_IDEMPOTENCY_KEY_MISSING,
      });
    }

    const userId = req.user?.id ?? 'anonymous';

    return from(this.idempotencyService.find(idempotencyKey, userId)).pipe(
      switchMap((cached) => {
        if (cached) {
          // Path validation: reject if path does not match
          if ((cached as any).path && (cached as any).path !== req.path) {
            throw new BadRequestException({
              message: 'Idempotency-Key reuse for different endpoint',
              errorCode: ErrorCode.VAL_IDEMPOTENCY_KEY_PATH_MISMATCH,
            });
          }
          res.status(cached.statusCode).json(cached.responseBody);
          // Return an empty observable – response is already sent.
          return new Observable((subscriber) => subscriber.complete());
        }

        return next.handle().pipe(
          tap((responseBody: unknown) => {
            const statusCode = res.statusCode;
            void this.idempotencyService.save(
              idempotencyKey,
              userId,
              req.path,
              statusCode,
              responseBody as Record<string, unknown>,
            );
          }),
        );
      }),
    );
  }
}
