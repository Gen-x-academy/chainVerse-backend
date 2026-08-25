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
  ) {
    super(message, HttpStatus.CONFLICT, errorCode);
  }
}

export class BusinessRuleException extends DomainException {
  constructor(message: string, errorCode: ErrorCode) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, errorCode);
  }
}
