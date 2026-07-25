import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger, NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Request, Response } from 'express';

export interface ErrorResponse {
  statusCode: number;
  error: string;
  errorCode?: string;
  message: string | string[];
  timestamp: string;
  path: string;
  requestId?: string;
}

const EXCEPTION_ERROR_CODE_MAP: Array<{ type: new (...args: unknown[]) => HttpException; errorCode: string }> = [
  { type: BadRequestException, errorCode: 'VAL_INVALID_INPUT' },
  { type: UnauthorizedException, errorCode: 'AUTH_INVALID_TOKEN' },
  { type: ForbiddenException, errorCode: 'AUTH_INSUFFICIENT_PERMISSIONS' },
  { type: NotFoundException, errorCode: 'RES_NOT_FOUND' },
  { type: ConflictException, errorCode: 'RES_ALREADY_EXISTS' },
];

function inferErrorCode(exception: HttpException): string | undefined {
  for (const mapping of EXCEPTION_ERROR_CODE_MAP) {
    if (exception instanceof mapping.type) return mapping.errorCode;
  }
  return undefined;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let errorCode: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const body = exceptionResponse as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        error = (body.error as string) ?? HttpStatus[statusCode] ?? 'Error';
        errorCode = body.errorCode as string | undefined;
      }

      if (!errorCode) {
        errorCode = inferErrorCode(exception);
      }
    }

    const requestId = request.headers['x-request-id'] as string | undefined;
    const logContext = {
      statusCode,
      path: request.url,
      method: request.method,
      requestId,
    };

    if (statusCode >= 500) {
      this.logger.error(
        logContext,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        logContext,
        Array.isArray(message) ? message.join(', ') : message,
      );
    }

    const payload: ErrorResponse = {
      statusCode,
      error,
      ...(errorCode && { errorCode }),
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(requestId && { requestId }),
    };

    response.status(statusCode).json(payload);
  }
}
