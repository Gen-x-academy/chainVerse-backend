import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { BlockingPolicy } from './blocking.policy';
import { MentorshipBlockingService } from './blocking.service';

export const BLOCK_TARGET_KEY = 'mentorship:blockTarget';

export interface BlockTargetSpec {
  /** Where the counterpart id is read from. Defaults to route params. */
  source?: 'params' | 'body';
  /** Name of the route param or body field holding the counterpart id. */
  key: string;
}

/**
 * Declare the counterpart to check on any matching entry point:
 *
 *   @UseGuards(MentorshipBlockGuard)
 *   @SetBlockTarget({ key: 'mentorId' })
 *   @Get(':mentorId')
 *
 * The guard is intentionally reusable rather than globally bound so each
 * discovery, recommendation, proposal, coordinator and rematch handler opts
 * in explicitly. Missing configuration or an unresolvable identity is denied.
 */
export const SetBlockTarget = (spec: BlockTargetSpec) =>
  SetMetadata(BLOCK_TARGET_KEY, spec);

@Injectable()
export class MentorshipBlockGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly blocking: MentorshipBlockingService,
    private readonly policy: BlockingPolicy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const spec = this.reflector.getAllAndOverride<BlockTargetSpec | undefined>(
      BLOCK_TARGET_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!spec?.key) this.policy.deny('block_guard_unconfigured');

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { sub?: string; id?: string } }>();
    const actorId = req.user?.sub ?? req.user?.id;
    if (!actorId) this.policy.deny('block_guard_unauthenticated');

    const raw =
      (spec.source ?? 'params') === 'params'
        ? req.params?.[spec.key]
        : (req.body as Record<string, unknown> | undefined)?.[spec.key];
    if (typeof raw !== 'string' || !raw) this.policy.deny('block_target_missing');

    await this.blocking.assertNotBlocked(actorId, raw, 'block_guard');
    return true;
  }
}
