import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthException, ForbiddenDomainException } from '../../common/errors';
import { FeeSchedulesController } from '../controllers/fee-schedules.controller';
import { RefundsController } from '../controllers/refunds.controller';
import { RecoveriesController } from '../controllers/recoveries.controller';
import { FundingController } from '../controllers/funding.controller';
import {
  FINANCE_PERMISSION_KEY,
  FinanceAccessGuard,
} from '../guards/finance-access.guard';

const controllers = [
  FeeSchedulesController,
  RefundsController,
  RecoveriesController,
  FundingController,
];

/** Every route handler on a controller: methods carrying HTTP-method metadata. */
function handlersOf(controller: new (...args: never[]) => unknown) {
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => ({
      name,
      fn: (controller.prototype as Record<string, unknown>)[name] as object,
    }))
    .filter(({ fn }) => typeof fn === 'function' && Reflect.hasMetadata(METHOD_METADATA, fn));
}

/** The guard only needs a request, handler and class to make its first decision. */
function contextFor(controller: unknown, handler: object, request: object) {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe.each(controllers.map((c) => [c.name, c] as const))('%s', (_name, controller) => {
  const handlers = handlersOf(controller);

  it('has route handlers to protect', () => {
    expect(handlers.length).toBeGreaterThan(0);
  });

  it('documents bearer authentication in OpenAPI', () => {
    expect(Reflect.getMetadata('swagger/apiSecurity', controller)).toEqual(
      expect.arrayContaining([expect.objectContaining({ 'access-token': [] })]),
    );
  });

  it.each(handlers.map((h) => [h.name, h.fn] as const))(
    '%s runs the JWT and finance-access guards and declares a permission',
    (_handlerName, fn) => {
      const guards = [
        ...(Reflect.getMetadata(GUARDS_METADATA, controller) ?? []),
        ...(Reflect.getMetadata(GUARDS_METADATA, fn) ?? []),
      ];

      expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, FinanceAccessGuard]));
      expect(Reflect.getMetadata(FINANCE_PERMISSION_KEY, fn)).toBeDefined();
    },
  );

  it('rejects an unauthenticated request on every handler', async () => {
    const guard = new FinanceAccessGuard(new Reflector(), {} as never);

    for (const { fn } of handlers) {
      const request = { params: { organizationId: '64f1a2b3c4d5e6f7a8b9c0d1' } };

      await expect(
        guard.canActivate(contextFor(controller, fn, request)),
      ).rejects.toBeInstanceOf(AuthException);
    }
  });
});

describe('FinanceAccessGuard denies by default', () => {
  const guard = new FinanceAccessGuard(new Reflector(), {
    collection: () => ({ findOne: async () => ({ _id: 'org' }) }),
  } as never);

  it('refuses a route that declares no permission, even for a platform admin', async () => {
    class Undeclared {
      handler() {}
    }
    const request = {
      user: { sub: 'admin-1', role: 'admin' },
      params: { organizationId: '64f1a2b3c4d5e6f7a8b9c0d1' },
    };

    await expect(
      guard.canActivate(contextFor(Undeclared, Undeclared.prototype.handler, request)),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);
  });
});
