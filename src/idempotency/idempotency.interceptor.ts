import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EMPTY, from, Observable, switchMap, tap } from 'rxjs';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { IdempotencyCheckStatus, IdempotencyService } from './idempotency.service';
import { IDEMPOTENT_KEY } from './decorators/idempotent.decorator';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { ResourceConflictException } from '../common/errors/domain.exception';

/** Replays a completed write for the same key and payload, or rejects a conflicting reuse. */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isIdempotent) return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { id?: string; sub?: string } }>();
    const res = http.getResponse<Response>();
    const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException({
        message: 'X-Idempotency-Key header is required for this endpoint',
        errorCode: ErrorCode.VAL_IDEMPOTENCY_KEY_MISSING,
      });
    }

    const userId = req.user?.id ?? req.user?.sub;
    if (!userId) {
      throw new BadRequestException({
        message: 'An authenticated user is required for an idempotent endpoint',
        errorCode: ErrorCode.AUTH_MISSING_TOKEN,
      });
    }
    const requestHash = crypto
      .createHash('sha256')
      .update(`${req.method}:${req.path}:${JSON.stringify(req.body ?? {})}`)
      .digest('hex');

    return from(
      this.idempotencyService.check(idempotencyKey.trim(), userId, req.path, requestHash),
    ).pipe(
      switchMap((result) => {
        if (result.status === IdempotencyCheckStatus.CONFLICT) {
          throw new ResourceConflictException(
            'X-Idempotency-Key was already used with a different request payload',
            ErrorCode.BIZ_DUPLICATE_REQUEST,
          );
        }
        if (result.status === IdempotencyCheckStatus.REPLAY && result.cached) {
          res.status(result.cached.statusCode).json(result.cached.responseBody);
          return EMPTY;
        }
        return next.handle().pipe(
          tap((responseBody: unknown) => {
            void this.idempotencyService.save(
              idempotencyKey.trim(),
              userId,
              req.path,
              requestHash,
              res.statusCode,
              (responseBody ?? {}) as Record<string, unknown>,
            );
          }),
        );
      }),
    );
  }
}
