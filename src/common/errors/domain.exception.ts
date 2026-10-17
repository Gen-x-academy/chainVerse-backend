import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes.enum';

/**
 * Base exception for all domain-level errors.
 *
 * Extends HttpException so the global AllExceptionsFilter can handle it
 * uniformly while also carrying a stable machine-readable `errorCode`.
 */
export class DomainException extends HttpException {
  readonly errorCode: ErrorCode;

  /**
   * @param details Optional structured context (e.g. conflicting fields)
   *                returned to the client alongside the error code.
   */
  constructor(
    message: string,
    statusCode: HttpStatus,
    errorCode: ErrorCode,
    details?: Record<string, unknown>,
  ) {
    super({ message, errorCode, ...(details && { details }) }, statusCode);
  constructor(message: string, statusCode: HttpStatus, errorCode: ErrorCode) {
    super({ message, errorCode }, statusCode);
    this.errorCode = errorCode;
  }
}

// ── Convenience subclasses ────────────────────────────────────────────────────

export class AuthException extends DomainException {
  constructor(message: string, errorCode: ErrorCode) {
    super(message, HttpStatus.UNAUTHORIZED, errorCode);
  }
}

export class ForbiddenDomainException extends DomainException {
  constructor(message: string, errorCode: ErrorCode) {
    super(message, HttpStatus.FORBIDDEN, errorCode);
  }
}

export class ValidationDomainException extends DomainException {
  constructor(
    message: string,
    errorCode: ErrorCode = ErrorCode.VAL_INVALID_INPUT,
    details?: Record<string, unknown>,
  ) {
    super(message, HttpStatus.BAD_REQUEST, errorCode, details);
  ) {
    super(message, HttpStatus.BAD_REQUEST, errorCode);
  }
}

export class ResourceNotFoundException extends DomainException {
  constructor(message: string, errorCode: ErrorCode = ErrorCode.RES_NOT_FOUND) {
    super(message, HttpStatus.NOT_FOUND, errorCode);
  }
}

export class ResourceConflictException extends DomainException {
  constructor(
    message: string,
    errorCode: ErrorCode = ErrorCode.RES_ALREADY_EXISTS,
    details?: Record<string, unknown>,
  ) {
    super(message, HttpStatus.CONFLICT, errorCode, details);
  ) {
    super(message, HttpStatus.CONFLICT, errorCode);
  }
}

export class BusinessRuleException extends DomainException {
  constructor(
    message: string,
    errorCode: ErrorCode,
    details?: Record<string, unknown>,
  ) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, errorCode, details);
  }
}
