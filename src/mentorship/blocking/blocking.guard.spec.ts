import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ErrorCode } from '../../common/errors';
import { BlockingPolicy } from './blocking.policy';
import { MentorshipBlockGuard, SetBlockTarget } from './blocking.guard';
import { MentorshipBlockingService } from './blocking.service';

const OTHER_USER = '507f1f77bcf86cd799439012';

const makeContext = (request: Record<string, unknown>): ExecutionContext =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe('MentorshipBlockGuard', () => {
  const blocking = { assertNotBlocked: jest.fn() };
  const telemetry = { count: jest.fn() };
  const policy = new BlockingPolicy(telemetry as never);
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new MentorshipBlockGuard(
    reflector as never,
    blocking as never,
    policy,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes a reusable decorator for entry points to opt in', () => {
    expect(typeof SetBlockTarget({ key: 'mentorId' })).toBe('function');
  });

  it('denies by default when no target is configured', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(
      guard.canActivate(makeContext({ user: { sub: 'a' }, params: {} })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(blocking.assertNotBlocked).not.toHaveBeenCalled();
  });

  it('denies unauthenticated callers and unresolvable targets', async () => {
    reflector.getAllAndOverride.mockReturnValue({ key: 'mentorId' });
    await expect(
      guard.canActivate(makeContext({ params: { mentorId: OTHER_USER } })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      guard.canActivate(makeContext({ user: { sub: 'a' }, params: {} })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(blocking.assertNotBlocked).not.toHaveBeenCalled();
  });

  it('checks the route-param counterpart for the authenticated actor', async () => {
    reflector.getAllAndOverride.mockReturnValue({ key: 'mentorId' });
    blocking.assertNotBlocked.mockResolvedValue(undefined);
    await expect(
      guard.canActivate(
        makeContext({
          user: { sub: 'a' },
          params: { mentorId: OTHER_USER },
        }),
      ),
    ).resolves.toBe(true);
    expect(blocking.assertNotBlocked).toHaveBeenCalledWith(
      'a',
      OTHER_USER,
      'block_guard',
    );
  });

  it('supports a body-field target for proposal creation', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      key: 'menteeId',
      source: 'body',
    });
    blocking.assertNotBlocked.mockResolvedValue(undefined);
    await expect(
      guard.canActivate(
        makeContext({ user: { sub: 'a' }, body: { menteeId: OTHER_USER } }),
      ),
    ).resolves.toBe(true);
    expect(blocking.assertNotBlocked).toHaveBeenCalledWith(
      'a',
      OTHER_USER,
      'block_guard',
    );
  });

  it('propagates the generic blocked error without leaking details', async () => {
    reflector.getAllAndOverride.mockReturnValue({ key: 'mentorId' });
    const blockedError = Object.assign(new Error('This match is not available'), {
      errorCode: ErrorCode.BIZ_MENTORSHIP_BLOCKED,
    });
    blocking.assertNotBlocked.mockRejectedValue(blockedError);
    await expect(
      guard.canActivate(
        makeContext({ user: { sub: 'a' }, params: { mentorId: OTHER_USER } }),
      ),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BIZ_MENTORSHIP_BLOCKED });
  });
});
