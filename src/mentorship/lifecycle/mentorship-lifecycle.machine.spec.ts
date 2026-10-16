import {
  allowedTargets,
  evaluateTransition,
  isTerminal,
  MentorshipActor,
  MentorshipActorKind,
  MentorshipState,
} from './mentorship-lifecycle.machine';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  BusinessRuleException,
  ForbiddenDomainException,
  ValidationDomainException,
} from '../../common/errors/domain.exception';

const STATES = Object.values(MentorshipState);
const KINDS = Object.values(MentorshipActorKind);
const actor = (kind: MentorshipActorKind): MentorshipActor => ({ id: `${kind}-1`, kind });
const NOW = new Date('2026-10-16T12:00:00Z');

/** Reason long enough for any transition, so authorisation is tested on its own. */
const REASON = 'because';

/** All (from, to) pairs that are real moves. */
const pairs = STATES.flatMap((from) => STATES.filter((to) => to !== from).map((to) => [from, to] as const));

describe('mentorship lifecycle machine', () => {
  it('knows the ten states from the specification', () => {
    expect(STATES.sort()).toEqual(
      [
        'draft', 'published', 'accepting', 'matched', 'active',
        'paused', 'completed', 'cancelled', 'disputed', 'archived',
      ].sort(),
    );
  });

  describe('forbidden transitions fail with a stable code', () => {
    const forbidden = pairs.filter(([from, to]) => !allowedTargets(from).includes(to));

    it('exist (the machine is not a free-for-all)', () => {
      expect(forbidden.length).toBeGreaterThan(0);
    });

    it.each(forbidden)("%s -> %s", (from, to) => {
      // Even an admin cannot take a move that is not an edge.
      const attempt = () => evaluateTransition(from, to, actor(MentorshipActorKind.ADMIN), REASON, NOW);

      expect(attempt).toThrow(BusinessRuleException);
      try {
        attempt();
      } catch (error) {
        expect((error as BusinessRuleException).errorCode).toBe(
          ErrorCode.BIZ_MENTORSHIP_TRANSITION_FORBIDDEN,
        );
      }
    });
  });

  describe('allowed transitions', () => {
    const allowed = pairs.filter(([from, to]) => allowedTargets(from).includes(to));

    it.each(allowed)('%s -> %s succeeds for an admin and records who, why, when and from where', (from, to) => {
      const outcome = evaluateTransition(from, to, actor(MentorshipActorKind.ADMIN), REASON, NOW);

      // Some edges are not open to admins (system-only moves are, but check generally below).
      expect(outcome.changed).toBe(true);
      if (outcome.changed) {
        expect(outcome.record).toEqual({
          from,
          to,
          actor: actor(MentorshipActorKind.ADMIN),
          reason: REASON,
          at: NOW,
        });
      }
    });

    it('denies every actor kind that is not listed for an edge (deny by default)', () => {
      let denied = 0;
      for (const [from, to] of allowed) {
        for (const kind of KINDS) {
          try {
            evaluateTransition(from, to, actor(kind), REASON, NOW);
          } catch (error) {
            expect(error).toBeInstanceOf(ForbiddenDomainException);
            denied += 1;
          }
        }
      }
      // Several edges are restricted to a subset of actors.
      expect(denied).toBeGreaterThan(0);
    });
  });

  describe('idempotency', () => {
    it.each(STATES)('asking for the state it is already in (%s) changes nothing', (state) => {
      for (const kind of KINDS) {
        expect(evaluateTransition(state, state, actor(kind), undefined, NOW)).toEqual({
          changed: false,
          state,
        });
      }
    });
  });

  describe('specific rules', () => {
    it('lets only an administrator resolve a dispute', () => {
      for (const to of [MentorshipState.ACTIVE, MentorshipState.COMPLETED, MentorshipState.CANCELLED]) {
        expect(evaluateTransition(MentorshipState.DISPUTED, to, actor(MentorshipActorKind.ADMIN), REASON, NOW).changed).toBe(true);
        for (const kind of [MentorshipActorKind.OWNER, MentorshipActorKind.MENTEE, MentorshipActorKind.SYSTEM]) {
          expect(() => evaluateTransition(MentorshipState.DISPUTED, to, actor(kind), REASON, NOW)).toThrow(
            ForbiddenDomainException,
          );
        }
      }
    });

    it('lets only the system or an admin match a mentorship', () => {
      expect(
        evaluateTransition(MentorshipState.ACCEPTING, MentorshipState.MATCHED, actor(MentorshipActorKind.SYSTEM), undefined, NOW).changed,
      ).toBe(true);
      expect(() =>
        evaluateTransition(MentorshipState.ACCEPTING, MentorshipState.MATCHED, actor(MentorshipActorKind.MENTEE), undefined, NOW),
      ).toThrow(ForbiddenDomainException);
    });

    it('does not let a mentee cancel before they are matched', () => {
      expect(() =>
        evaluateTransition(MentorshipState.ACCEPTING, MentorshipState.CANCELLED, actor(MentorshipActorKind.MENTEE), REASON, NOW),
      ).toThrow(ForbiddenDomainException);
    });

    it('treats archived as final', () => {
      expect(isTerminal(MentorshipState.ARCHIVED)).toBe(true);
      expect(allowedTargets(MentorshipState.ARCHIVED)).toEqual([]);
      for (const to of STATES.filter((s) => s !== MentorshipState.ARCHIVED)) {
        expect(() => evaluateTransition(MentorshipState.ARCHIVED, to, actor(MentorshipActorKind.ADMIN), REASON, NOW)).toThrow(
          BusinessRuleException,
        );
      }
      expect(STATES.filter(isTerminal)).toEqual([MentorshipState.ARCHIVED]);
    });

    it('reaches every state from draft (nothing is orphaned)', () => {
      const seen = new Set<MentorshipState>([MentorshipState.DRAFT]);
      const queue = [MentorshipState.DRAFT];
      while (queue.length) {
        for (const next of allowedTargets(queue.shift() as MentorshipState)) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect([...seen].sort()).toEqual([...STATES].sort());
    });
  });

  describe('reasons', () => {
    it.each([
      [MentorshipState.ACTIVE, MentorshipState.CANCELLED],
      [MentorshipState.ACTIVE, MentorshipState.PAUSED],
      [MentorshipState.ACTIVE, MentorshipState.DISPUTED],
      [MentorshipState.DISPUTED, MentorshipState.COMPLETED],
    ])('%s -> %s requires one', (from, to) => {
      for (const reason of [undefined, '', '   ']) {
        const attempt = () => evaluateTransition(from, to, actor(MentorshipActorKind.ADMIN), reason, NOW);
        expect(attempt).toThrow(ValidationDomainException);
        try {
          attempt();
        } catch (error) {
          expect((error as ValidationDomainException).errorCode).toBe(
            ErrorCode.VAL_MENTORSHIP_REASON_REQUIRED,
          );
        }
      }
    });

    it('is optional for ordinary moves and stored trimmed', () => {
      const without = evaluateTransition(MentorshipState.DRAFT, MentorshipState.PUBLISHED, actor(MentorshipActorKind.OWNER), undefined, NOW);
      const padded = evaluateTransition(MentorshipState.DRAFT, MentorshipState.PUBLISHED, actor(MentorshipActorKind.OWNER), '  ready  ', NOW);

      expect(without.changed && without.record.reason).toBeNull();
      expect(padded.changed && padded.record.reason).toBe('ready');
    });

    it('is capped in length', () => {
      expect(() =>
        evaluateTransition(MentorshipState.DRAFT, MentorshipState.PUBLISHED, actor(MentorshipActorKind.OWNER), 'x'.repeat(501), NOW),
      ).toThrow(ValidationDomainException);
    });

    it('is checked after authorisation, so an unauthorised caller learns nothing about reasons', () => {
      expect(() =>
        evaluateTransition(MentorshipState.ACTIVE, MentorshipState.CANCELLED, actor(MentorshipActorKind.SYSTEM), undefined, NOW),
      ).toThrow(ForbiddenDomainException);
    });
  });
});
