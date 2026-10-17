import { HttpStatus } from '@nestjs/common';
import { DomainException, ErrorCode } from '../../common/errors';

/**
 * DomainException with client-safe structured `details` (current versions,
 * failed eligibility checks, …) so callers can recover without parsing text.
 */
export class MentorshipDomainException extends DomainException {
  constructor(message: string, status: HttpStatus, errorCode: ErrorCode, details?: Record<string, unknown>) {
    super(message, status, errorCode);
    if (details) (this.getResponse() as Record<string, unknown>).details = details;
  }
}

export const staleVersion = (message: string, details: Record<string, unknown>) =>
  new MentorshipDomainException(message, HttpStatus.CONFLICT, ErrorCode.MENTOR_STALE_VERSION, details);

export const conflict = (message: string, errorCode: ErrorCode, details?: Record<string, unknown>) =>
  new MentorshipDomainException(message, HttpStatus.CONFLICT, errorCode, details);
