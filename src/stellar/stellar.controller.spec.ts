import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StellarController } from './stellar.controller';

const proto = StellarController.prototype;
const reflector = new Reflector();

const guardsOf = (handler: (...args: never[]) => unknown): unknown[] =>
  Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];

const isPublic = (handler: (...args: never[]) => unknown): boolean =>
  reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    handler,
    StellarController,
  ]) === true;

describe('StellarController authentication', () => {
  it.each([
    ['createAccount', proto.createAccount],
    ['verifyPayment', proto.verifyPayment],
  ])('%s requires JwtAuthGuard and is not public', (_name, handler) => {
    expect(guardsOf(handler)).toContain(JwtAuthGuard);
    expect(isPublic(handler)).toBe(false);
  });

  it('is not marked @Public at class level', () => {
    expect(
      Reflect.getMetadata(IS_PUBLIC_KEY, StellarController),
    ).toBeUndefined();
  });

  it('keeps the read-only balance lookup public', () => {
    expect(isPublic(proto.getBalance)).toBe(true);
  });

  it('rejects an unauthenticated request to a protected route with 401', () => {
    const guard = new JwtAuthGuard(
      {} as never,
      {} as never,
      reflector,
      {} as never,
    );
    const context = {
      getHandler: () => proto.createAccount,
      getClass: () => StellarController,
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
