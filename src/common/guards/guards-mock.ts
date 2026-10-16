import {
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { OrganizationRolesGuard } from './organization-roles.guard';
import {
  ORG_ROLES_KEY,
  ORG_SCOPE_KEY,
  OrgScopeOptions,
} from '../decorators/org-roles.decorator';
import { OrganizationRole } from '../enums/organization-role.enum';
import { Role } from '../enums/role.enum';
import { OrganizationMember } from '../../organization-member/schemas/organization-member.schema';

interface MembershipRow {
  _id?: string;
  organizationId: string;
  userId: string;
  role: string;
}

/** In-memory membership store standing in for the Mongoose model. */
let memberships: MembershipRow[] = [];

const mockMemberModel = {
  findOne: jest.fn((filter: Record<string, any>) => ({
    exec: async () =>
      memberships.find((row) => {
        if (filter._id && row._id !== filter._id) return false;
        if (
          filter.organizationId &&
          row.organizationId !== filter.organizationId
        )
          return false;
        if (filter.userId && row.userId !== filter.userId) return false;
        return true;
      }) ?? null,
  })),
};

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as unknown as ExecutionContext;
}

describe('OrganizationRolesGuard', () => {
  let guard: OrganizationRolesGuard;
  let reflector: Reflector;

  const configureRoute = (
    roles: OrganizationRole[] | undefined,
    scope?: OrgScopeOptions,
  ) => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: string) => {
        if (key === ORG_ROLES_KEY) return roles;
        if (key === ORG_SCOPE_KEY) return scope;
        return undefined;
      });
  };

  beforeEach(async () => {
    memberships = [
      {
        _id: 'm-owner',
        organizationId: 'org-a',
        userId: 'u-owner',
        role: OrganizationRole.OWNER,
      },
      {
        _id: 'm-admin',
        organizationId: 'org-a',
        userId: 'u-admin',
        role: OrganizationRole.ADMIN,
      },
      {
        _id: 'm-instr',
        organizationId: 'org-a',
        userId: 'u-instr',
        role: OrganizationRole.INSTRUCTOR,
      },
      {
        _id: 'm-member',
        organizationId: 'org-a',
        userId: 'u-member',
        role: OrganizationRole.MEMBER,
      },
      // Same person, different tenant — the cross-organization case.
      {
        _id: 'm-b-owner',
        organizationId: 'org-b',
        userId: 'u-b-owner',
        role: OrganizationRole.OWNER,
      },
    ];
    mockMemberModel.findOne.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationRolesGuard,
        Reflector,
        {
          provide: getModelToken(OrganizationMember.name),
          useValue: mockMemberModel,
        },
      ],
    }).compile();

    guard = module.get(OrganizationRolesGuard);
    reflector = module.get(Reflector);
  });

  it('allows a handler with no @OrgRoles through untouched', async () => {
    configureRoute(undefined);

    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
  });

  it('fails closed when @OrgScope is missing on a guarded route', async () => {
    configureRoute([OrganizationRole.OWNER]);

    await expect(
      guard.canActivate(
        makeContext({ user: { sub: 'u-owner' }, params: { id: 'org-a' } }),
      ),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('rejects an unauthenticated caller', async () => {
    configureRoute([OrganizationRole.OWNER], { source: 'param', key: 'id' });

    await expect(
      guard.canActivate(makeContext({ params: { id: 'org-a' } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  describe('membership enforcement', () => {
    it('allows a member holding a listed role', async () => {
      configureRoute([OrganizationRole.OWNER, OrganizationRole.ADMIN], {
        source: 'param',
        key: 'id',
      });
      const request: any = {
        user: { sub: 'u-admin', role: Role.STUDENT },
        params: { id: 'org-a' },
      };

      await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
      expect(request.organizationMembership).toEqual({
        organizationId: 'org-a',
        role: OrganizationRole.ADMIN,
        viaPlatformAdmin: false,
      });
    });

    it('denies a member whose role is not listed', async () => {
      configureRoute([OrganizationRole.OWNER, OrganizationRole.ADMIN], {
        source: 'param',
        key: 'id',
      });

      await expect(
        guard.canActivate(
          makeContext({
            user: { sub: 'u-member', role: Role.STUDENT },
            params: { id: 'org-a' },
          }),
        ),
      ).rejects.toThrow(/not permitted to perform this action/);
    });

    it('denies an instructor attempting an owner-only action', async () => {
      configureRoute([OrganizationRole.OWNER], { source: 'param', key: 'id' });

      await expect(
        guard.canActivate(
          makeContext({
            user: { sub: 'u-instr', role: Role.TUTOR },
            params: { id: 'org-a' },
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cross-organization denial', () => {
    it("denies org-b's owner acting on org-a", async () => {
      configureRoute([OrganizationRole.OWNER, OrganizationRole.ADMIN], {
        source: 'param',
        key: 'id',
      });

      await expect(
        guard.canActivate(
          makeContext({
            user: { sub: 'u-b-owner', role: Role.TUTOR },
            params: { id: 'org-a' },
          }),
        ),
      ).rejects.toThrow('You are not a member of this organization');
    });

    it("denies org-a's owner acting on org-b", async () => {
      configureRoute([OrganizationRole.OWNER], { source: 'param', key: 'id' });

      await expect(
        guard.canActivate(
          makeContext({
            user: { sub: 'u-owner', role: Role.TUTOR },
            params: { id: 'org-b' },
          }),
        ),
      ).rejects.toThrow('You are not a member of this organization');
    });

    it('denies a caller with no membership anywhere', async () => {
      configureRoute([OrganizationRole.MEMBER], { source: 'param', key: 'id' });

      await expect(
        guard.canActivate(
          makeContext({
            user: { sub: 'nobody', role: Role.STUDENT },
            params: { id: 'org-a' },
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies cross-organization access through the body scope', async () => {
      configureRoute([OrganizationRole.OWNER, OrganizationRole.ADMIN], {
        source: 'body',
        key: 'organizationId',
      });

      await expect(
        guard.canActivate(
          makeContext({
            user: { sub: 'u-b-owner', role: Role.TUTOR },
            body: { organizationId: 'org-a', userId: 'victim' },
          }),
        ),
      ).rejects.toThrow('You are not a member of this organization');
    });

    it("denies acting on another organization's membership record", async () => {
      configureRoute([OrganizationRole.OWNER, OrganizationRole.ADMIN], {
        source: 'membershipParam',
        key: 'id',
      });

      // u-b-owner owns org-b; m-member belongs to org-a.
      await expect(
        guard.canActivate(
          makeContext({
            user: { sub: 'u-b-owner', role: Role.TUTOR },
            params: { id: 'm-member' },
          }),
        ),
      ).rejects.toThrow('You are not a member of this organization');
    });

    it("allows acting on a membership inside the caller's own organization", async () => {
      configureRoute([OrganizationRole.OWNER, OrganizationRole.ADMIN], {
        source: 'membershipParam',
        key: 'id',
      });
      const request: any = {
        user: { sub: 'u-owner', role: Role.TUTOR },
        params: { id: 'm-member' },
      };

      await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
      expect(request.organizationMembership.organizationId).toBe('org-a');
      expect(request.organizationMembership.role).toBe(OrganizationRole.OWNER);
    });
  });

  describe('scope resolution', () => {
    it('denies when the organization cannot be determined', async () => {
      configureRoute([OrganizationRole.OWNER], { source: 'param', key: 'id' });

      await expect(
        guard.canActivate(
          makeContext({ user: { sub: 'u-owner' }, params: {} }),
        ),
      ).rejects.toThrow('Organization could not be determined');
    });

    it('denies when the referenced membership does not exist', async () => {
      configureRoute([OrganizationRole.OWNER], {
        source: 'membershipParam',
        key: 'id',
      });

      await expect(
        guard.canActivate(
          makeContext({
            user: { sub: 'u-owner' },
            params: { id: 'does-not-exist' },
          }),
        ),
      ).rejects.toThrow('Organization could not be determined');
    });
  });

  describe('platform admin break-glass', () => {
    it('permits a platform admin with no membership, and flags the path', async () => {
      configureRoute([OrganizationRole.OWNER], { source: 'param', key: 'id' });
      const request: any = {
        user: { sub: 'platform-admin', role: Role.ADMIN },
        params: { id: 'org-a' },
      };

      await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
      expect(request.organizationMembership).toEqual({
        organizationId: 'org-a',
        role: OrganizationRole.OWNER,
        viaPlatformAdmin: true,
      });
    });

    it('does not extend the bypass to a platform moderator', async () => {
      configureRoute([OrganizationRole.OWNER], { source: 'param', key: 'id' });

      await expect(
        guard.canActivate(
          makeContext({
            user: { sub: 'platform-mod', role: Role.MODERATOR },
            params: { id: 'org-a' },
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("still honours an admin's real membership role when they have one", async () => {
      configureRoute([OrganizationRole.MEMBER], { source: 'param', key: 'id' });
      const request: any = {
        user: { sub: 'u-member', role: Role.ADMIN },
        params: { id: 'org-a' },
      };

      await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
      expect(request.organizationMembership.viaPlatformAdmin).toBe(false);
    });
  });
});
