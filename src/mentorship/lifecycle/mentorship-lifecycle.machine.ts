import {
  BusinessRuleException,
  ForbiddenDomainException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';
import { ErrorCode } from '../../common/errors/error-codes.enum';

/** Where a mentorship is in its life. */
export enum MentorshipState {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ACCEPTING = 'accepting',
  MATCHED = 'matched',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed',
  ARCHIVED = 'archived',
}

/** Who is asking for a transition. */
export enum MentorshipActorKind {
  /** The mentor who owns the mentorship. */
  OWNER = 'owner',
  /** The mentee taking part in it. */
  MENTEE = 'mentee',
  /** A platform administrator. */
  ADMIN = 'admin',
  /** A background workflow (matching, scheduling), not a person. */
  SYSTEM = 'system',
}

export interface MentorshipActor {
  /** User id for people, a workflow name for `system`. */
  id: string;
  kind: MentorshipActorKind;
}

/** What is stored for every change of state. */
export interface MentorshipTransitionRecord {
  from: MentorshipState;
  to: MentorshipState;
  actor: MentorshipActor;
  reason: string | null;
  at: Date;
}

export type TransitionOutcome =
  | { changed: false; state: MentorshipState }
  | { changed: true; state: MentorshipState; record: MentorshipTransitionRecord };

const { OWNER, MENTEE, ADMIN, SYSTEM } = MentorshipActorKind;
const S = MentorshipState;

/**
 * Every allowed transition and who may perform it. This is the whole policy: a pair
 * that is not listed is forbidden for everybody, and a listed pair is allowed only
 * for the listed kinds, so access is denied by default.
 */
const TRANSITIONS: ReadonlyArray<
  readonly [MentorshipState, MentorshipState, readonly MentorshipActorKind[]]
> = [
  // Authoring and intake
  [S.DRAFT, S.PUBLISHED, [OWNER, ADMIN]],
  [S.PUBLISHED, S.DRAFT, [OWNER, ADMIN]],
  [S.PUBLISHED, S.ACCEPTING, [OWNER, ADMIN]],
  [S.ACCEPTING, S.PUBLISHED, [OWNER, ADMIN]],
  // Matching
  [S.ACCEPTING, S.MATCHED, [SYSTEM, ADMIN]],
  [S.MATCHED, S.ACCEPTING, [SYSTEM, ADMIN]],
  [S.MATCHED, S.ACTIVE, [OWNER, SYSTEM, ADMIN]],
  // Running
  [S.ACTIVE, S.PAUSED, [OWNER, MENTEE, ADMIN]],
  [S.PAUSED, S.ACTIVE, [OWNER, MENTEE, ADMIN]],
  [S.ACTIVE, S.COMPLETED, [OWNER, SYSTEM, ADMIN]],
  // Cancellation: before a mentee is involved only the owner (or an admin) may cancel
  [S.DRAFT, S.CANCELLED, [OWNER, ADMIN]],
  [S.PUBLISHED, S.CANCELLED, [OWNER, ADMIN]],
  [S.ACCEPTING, S.CANCELLED, [OWNER, ADMIN]],
  [S.MATCHED, S.CANCELLED, [OWNER, MENTEE, ADMIN]],
  [S.ACTIVE, S.CANCELLED, [OWNER, MENTEE, ADMIN]],
  [S.PAUSED, S.CANCELLED, [OWNER, MENTEE, ADMIN]],
  // Disputes can be raised by either side while money or sessions are in play
  [S.MATCHED, S.DISPUTED, [OWNER, MENTEE, ADMIN]],
  [S.ACTIVE, S.DISPUTED, [OWNER, MENTEE, ADMIN]],
  [S.PAUSED, S.DISPUTED, [OWNER, MENTEE, ADMIN]],
  [S.COMPLETED, S.DISPUTED, [OWNER, MENTEE, ADMIN]],
  // ...and only an administrator resolves them
  [S.DISPUTED, S.ACTIVE, [ADMIN]],
  [S.DISPUTED, S.COMPLETED, [ADMIN]],
  [S.DISPUTED, S.CANCELLED, [ADMIN]],
  // Archiving ends the life of a mentorship and is final
  [S.DRAFT, S.ARCHIVED, [OWNER, ADMIN]],
  [S.PUBLISHED, S.ARCHIVED, [OWNER, ADMIN]],
  [S.ACCEPTING, S.ARCHIVED, [OWNER, ADMIN]],
  [S.COMPLETED, S.ARCHIVED, [OWNER, SYSTEM, ADMIN]],
  [S.CANCELLED, S.ARCHIVED, [OWNER, SYSTEM, ADMIN]],
];

const EDGES = new Map<string, readonly MentorshipActorKind[]>(
  TRANSITIONS.map(([from, to, actors]) => [`${from}>${to}`, actors]),
);

/** Moves that cannot be made without saying why. */
const REASON_REQUIRED = new Set<MentorshipState>([
  MentorshipState.CANCELLED,
  MentorshipState.DISPUTED,
  MentorshipState.PAUSED,
]);

export const MAX_REASON_LENGTH = 500;

/** States a mentorship can move to from `from`, whoever is asking. */
export function allowedTargets(from: MentorshipState): MentorshipState[] {
  return TRANSITIONS.filter(([f]) => f === from).map(([, to]) => to);
}

export function isTerminal(state: MentorshipState): boolean {
  return allowedTargets(state).length === 0;
}

/**
 * Decides one transition. Pure: it neither reads nor writes anything, so the rules can
 * be tested exhaustively and reused by any caller that persists the result.
 *
 * - Asking for the state it is already in succeeds without a change, so a retry is safe.
 * - A pair that is not an edge fails with `BIZ_MENTORSHIP_TRANSITION_FORBIDDEN`.
 * - An edge the actor may not use fails with `AUTH_INSUFFICIENT_PERMISSIONS`.
 * - Cancelling, pausing and disputing, and any move out of a dispute, need a reason.
 */
export function evaluateTransition(
  current: MentorshipState,
  to: MentorshipState,
  actor: MentorshipActor,
  reason: string | undefined,
  now: Date = new Date(),
): TransitionOutcome {
  if (current === to) {
    return { changed: false, state: current };
  }

  const allowedActors = EDGES.get(`${current}>${to}`);
  if (!allowedActors) {
    const targets = allowedTargets(current);
    throw new BusinessRuleException(
      `A mentorship in '${current}' cannot move to '${to}'. ` +
        (targets.length > 0
          ? `Allowed next states: ${targets.join(', ')}.`
          : `'${current}' is final.`),
      ErrorCode.BIZ_MENTORSHIP_TRANSITION_FORBIDDEN,
    );
  }
  if (!allowedActors.includes(actor.kind)) {
    throw new ForbiddenDomainException(
      `A ${actor.kind} may not move a mentorship from '${current}' to '${to}'.`,
      ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
    );
  }

  const cleanReason = reason?.trim() || null;
  const needsReason = REASON_REQUIRED.has(to) || current === MentorshipState.DISPUTED;
  if (needsReason && !cleanReason) {
    throw new ValidationDomainException(
      `Moving a mentorship to '${to}' requires a reason.`,
      ErrorCode.VAL_MENTORSHIP_REASON_REQUIRED,
    );
  }
  if (cleanReason && cleanReason.length > MAX_REASON_LENGTH) {
    throw new ValidationDomainException(
      `The reason must not exceed ${MAX_REASON_LENGTH} characters.`,
      ErrorCode.VAL_MENTORSHIP_REASON_REQUIRED,
    );
  }

  return {
    changed: true,
    state: to,
    record: { from: current, to, actor, reason: cleanReason, at: now },
  };
}
