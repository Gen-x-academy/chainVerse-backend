import { Injectable } from '@nestjs/common';
import { ErrorCode, ForbiddenDomainException } from '../../common/errors';
import { MentorshipTelemetry } from '../shared/mentorship-telemetry.service';

/**
 * Deny-by-default authorization for block administration. Coordinators get
 * no silent bypass: no API exists for reading or deleting another user's
 * block. Admin inspection is out of scope for MENTOR-044 and must be added
 * deliberately with an audited reason if ever required.
 */
@Injectable()
export class BlockingPolicy {
  constructor(private readonly telemetry: MentorshipTelemetry) {}

  assertOwnBlock(actorId: string, blockerId: string): void {
    if (!actorId || actorId !== blockerId) {
      this.deny('foreign_block');
    }
  }

  deny(reason: string, message = 'You do not have access to this mentorship resource'): never {
    try {
      this.telemetry.count('mentorship_block_authz_denied_total', {
        reason: reason.replace(/[^a-z0-9_]/g, '_').slice(0, 40) || 'other',
      });
    } catch {
      // Observability must never break a business path.
    }
    throw new ForbiddenDomainException(message, ErrorCode.MENTOR_ACCESS_DENIED);
  }
}
