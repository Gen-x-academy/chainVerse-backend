import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProfilingController } from './profiling.controller';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { Role } from '../common/enums/role.enum';

describe('ProfilingController access control', () => {
  it('is not marked public, so the global JWT guard authenticates it', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ProfilingController)).toBeFalsy();
  });

  it('applies the JWT and roles guards to every route', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ProfilingController);

    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
  });

  it('requires the admin role', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ProfilingController)).toEqual([Role.ADMIN]);
  });

  describe('RolesGuard against this controller', () => {
    const guard = new RolesGuard(new Reflector());
    const contextFor = (user: unknown) =>
      ({
        getHandler: () => ProfilingController.prototype.listProfiles,
        getClass: () => ProfilingController,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as never;

    it('lets an admin through', () => {
      expect(guard.canActivate(contextFor({ role: Role.ADMIN }))).toBe(true);
    });

    it.each([Role.STUDENT, Role.TUTOR, Role.MODERATOR, Role.LIBRARIAN])(
      'rejects a %s',
      (role) => {
        expect(() => guard.canActivate(contextFor({ role }))).toThrow(ForbiddenException);
      },
    );

    it('rejects a request with no user', () => {
      expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
    });
  });
});
