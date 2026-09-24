import {
  isOrganizationRole,
  ORGANIZATION_ROLE_HIERARCHY,
  OrganizationRole,
  organizationRoleSatisfies,
} from './organization-role.enum';

describe('OrganizationRole', () => {
  it('expresses the four organization-scoped roles', () => {
    expect(ORGANIZATION_ROLE_HIERARCHY).toEqual([
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
      OrganizationRole.INSTRUCTOR,
      OrganizationRole.MEMBER,
    ]);
  });

  describe('isOrganizationRole', () => {
    it.each(Object.values(OrganizationRole))('accepts %s', (role) => {
      expect(isOrganizationRole(role)).toBe(true);
    });

    it.each([
      ['a platform role', 'student'],
      ['an unknown string', 'superuser'],
      ['a non-string', 42],
      ['null', null],
      ['undefined', undefined],
    ])('rejects %s', (_label, value) => {
      expect(isOrganizationRole(value)).toBe(false);
    });
  });

  describe('organizationRoleSatisfies', () => {
    it('lets a higher role satisfy a lower requirement', () => {
      expect(
        organizationRoleSatisfies(
          OrganizationRole.OWNER,
          OrganizationRole.MEMBER,
        ),
      ).toBe(true);
      expect(
        organizationRoleSatisfies(
          OrganizationRole.ADMIN,
          OrganizationRole.INSTRUCTOR,
        ),
      ).toBe(true);
    });

    it('does not let a lower role satisfy a higher requirement', () => {
      expect(
        organizationRoleSatisfies(
          OrganizationRole.MEMBER,
          OrganizationRole.OWNER,
        ),
      ).toBe(false);
      expect(
        organizationRoleSatisfies(
          OrganizationRole.INSTRUCTOR,
          OrganizationRole.ADMIN,
        ),
      ).toBe(false);
    });

    it('treats a role as satisfying itself', () => {
      for (const role of ORGANIZATION_ROLE_HIERARCHY) {
        expect(organizationRoleSatisfies(role, role)).toBe(true);
      }
    });
  });
});
