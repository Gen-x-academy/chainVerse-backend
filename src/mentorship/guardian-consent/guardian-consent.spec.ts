import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { MentorshipUser } from '../shared/mentorship-context';
import { AgePolicyService } from './age-policy.service';
import { GuardianConsentPolicy } from './guardian-consent.policy';
import { GuardianConsentService } from './guardian-consent.service';
import {
  AcceptGuardianConsentDto,
  InviteGuardianDto,
  ReConsentGuardianDto,
} from './dto/guardian-consent.dto';
import {
  ConsentScope,
  GuardianConsentStatus,
  RelationshipKind,
} from './schemas/guardian-consent.schema';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: true,
});

const validate = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: 'body', metatype });

const MINOR = '507f1f77bcf86cd799439011';
const GUARDIAN = '507f1f77bcf86cd799439012';
const ENGAGEMENT = '507f1f77bcf86cd799439013';
const PROGRAM = '507f1f77bcf86cd799439014';
const REF = 'verified-relationship-1';

const user = (id: string, role = Role.STUDENT): MentorshipUser => ({
  id,
  email: `${id}@example.com`,
  role,
});

/** Minimal in-memory stand-in for the append-only Mongoose collection. */
class FakeConsentModel {
  docs: any[] = [];
  private counter = 0;

  private matches(doc: any, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => doc[key] === value);
  }

  findOne(filter: Record<string, unknown>) {
    return {
      sort: (spec: Record<string, number>) => ({
        exec: async () => {
          const key = Object.keys(spec)[0];
          const direction = spec[key];
          const rows = this.docs.filter((d) => this.matches(d, filter));
          rows.sort((a, b) =>
            direction === -1 ? b[key] - a[key] : a[key] - b[key],
          );
          return rows[0] ?? null;
        },
      }),
      exec: async () =>
        this.docs.find((d) => this.matches(d, filter)) ?? null,
    };
  }

  find(filter: Record<string, unknown>) {
    return {
      sort: (spec: Record<string, number>) => ({
        exec: async () => {
          const key = Object.keys(spec)[0];
          const direction = spec[key];
          const rows = this.docs.filter((d) => this.matches(d, filter));
          rows.sort((a, b) =>
            direction === -1 ? b[key] - a[key] : a[key] - b[key],
          );
          return rows;
        },
      }),
    };
  }

  async create(data: any) {
    const duplicate =
      this.docs.some((d) => d.inviteTokenHash === data.inviteTokenHash) ||
      this.docs.some(
        (d) => d.idempotencyKeyHash === data.idempotencyKeyHash,
      ) ||
      this.docs.some(
        (d) =>
          d.minorId === data.minorId &&
          d.engagementId === data.engagementId &&
          d.sequence === data.sequence,
      );
    if (duplicate) {
      const error: Error & { code?: number } = new Error('duplicate key');
      error.code = 11000;
      throw error;
    }
    const doc = {
      _id: `doc-${++this.counter}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.docs.push(doc);
    return doc;
  }
}

const expiresAt = () =>
  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const invitePayload = () => ({
  minorId: MINOR,
  engagementId: ENGAGEMENT,
  programId: PROGRAM,
  dateOfBirth: '2012-05-20',
  guardianContact: 'guardian@example.com',
  relationship: RelationshipKind.PARENT,
  verifiedRelationshipRef: REF,
  scopes: [ConsentScope.MENTORSHIP],
  termsVersion: 1,
  expiresAt: expiresAt(),
  idempotencyKey: 'invite-key-1',
});

describe('Guardian consent DTOs', () => {
  it('accepts a complete invite payload', async () => {
    await expect(
      validate(InviteGuardianDto, invitePayload()),
    ).resolves.toBeInstanceOf(InviteGuardianDto);
  });

  it.each([
    ['an unknown relationship', { relationship: 'uncle' }],
    ['an empty scope list', { scopes: [] }],
    ['a zero termsVersion', { termsVersion: 0 }],
    ['an invalid expiry date', { expiresAt: 'soon' }],
    ['a missing guardian contact', { guardianContact: undefined }],
    ['an unknown field', { isMinor: false }],
  ])('rejects %s', async (_label, patch) => {
    await expect(
      validate(InviteGuardianDto, { ...invitePayload(), ...patch }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an invite token and matching reference on acceptance', async () => {
    const good = {
      inviteToken: 'token',
      verifiedRelationshipRef: REF,
      idempotencyKey: 'accept-key-1',
    };
    await expect(
      validate(AcceptGuardianConsentDto, good),
    ).resolves.toBeInstanceOf(AcceptGuardianConsentDto);
    await expect(
      validate(AcceptGuardianConsentDto, { ...good, inviteToken: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AgePolicyService', () => {
  const policy = new AgePolicyService();

  it('requires a guardian for a minor', () => {
    const decision = policy.evaluate('2012-05-20', 'US', new Date('2026-01-01'));
    expect(decision.guardianRequired).toBe(true);
    expect(decision.age).toBe(13);
    expect(decision.reasons).toContain('PARTICIPANT_BELOW_MAJORITY');
  });

  it('does not require a guardian for an adult', () => {
    expect(policy.evaluate('2000-01-01', 'US').guardianRequired).toBe(false);
  });

  it('applies jurisdiction-specific thresholds', () => {
    const now = new Date('2026-01-01');
    expect(policy.evaluate('2007-01-01', 'JP', now).guardianRequired).toBe(true);
    expect(policy.evaluate('2007-01-01', 'US', now).guardianRequired).toBe(false);
  });

  it('rejects an invalid date of birth', () => {
    expect(() => policy.evaluate('not-a-date')).toThrow(BadRequestException);
  });
});

describe('GuardianConsentService', () => {
  let model: FakeConsentModel;
  let service: GuardianConsentService;
  let telemetry: { count: jest.Mock };

  beforeEach(() => {
    model = new FakeConsentModel();
    telemetry = { count: jest.fn() };
    service = new GuardianConsentService(
      model as any,
      new AgePolicyService(),
      new GuardianConsentPolicy(telemetry as any),
      telemetry as any,
    );
  });

  const invite = () => service.invite(user(MINOR), invitePayload() as any);

  it('creates a privacy-safe invite exactly once for an idempotency key', async () => {
    const first = await invite();
    const second = await invite();

    expect(first.inviteToken).toBe(second.inviteToken);
    expect(model.docs).toHaveLength(1);
    expect(model.docs[0].status).toBe(GuardianConsentStatus.INVITED);
    for (const privateKey of [
      'guardianContactHash',
      'inviteTokenHash',
      'reasonHash',
      'verifiedRelationshipRef',
    ]) {
      expect(first.snapshot).not.toHaveProperty(privateKey);
    }
    expect(first.snapshot.sequence).toBe(1);
  });

  it('rejects an invite when no guardian consent is required', async () => {
    await expect(
      service.invite(user(MINOR), {
        ...invitePayload(),
        dateOfBirth: '2000-01-01',
      } as any),
    ).rejects.toThrow('GUARDIAN_CONSENT_NOT_REQUIRED');
    expect(model.docs).toHaveLength(0);
  });

  it('lets a third party invite, but never accept, as the guardian', async () => {
    const { inviteToken } = await invite();
    await expect(
      service.accept(user(MINOR), {
        inviteToken,
        verifiedRelationshipRef: REF,
        idempotencyKey: 'accept-self',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unverified relationship reference', async () => {
    const { inviteToken } = await invite();
    await expect(
      service.accept(user(GUARDIAN), {
        inviteToken,
        verifiedRelationshipRef: 'wrong-ref',
        idempotencyKey: 'accept-wrong',
      }),
    ).rejects.toThrow('GUARDIAN_RELATIONSHIP_UNVERIFIED');
  });

  it('grants, is idempotent on accept, and revocation blocks activity', async () => {
    const { inviteToken } = await invite();
    const acceptDto = {
      inviteToken,
      verifiedRelationshipRef: REF,
      idempotencyKey: 'accept-1',
    };
    const granted = await service.accept(user(GUARDIAN), acceptDto);
    const replay = await service.accept(user(GUARDIAN), acceptDto);
    expect(replay.sequence).toBe(granted.sequence);
    expect(model.docs).toHaveLength(2);
    expect(model.docs[1].status).toBe(GuardianConsentStatus.GRANTED);

    await expect(
      service.assertActive(MINOR, ENGAGEMENT, [ConsentScope.MENTORSHIP]),
    ).resolves.toBeDefined();

    await service.revoke(user(GUARDIAN), {
      minorId: MINOR,
      engagementId: ENGAGEMENT,
      idempotencyKey: 'revoke-1',
    });
    await expect(
      service.assertActive(MINOR, ENGAGEMENT, [ConsentScope.MENTORSHIP]),
    ).rejects.toThrow('GUARDIAN_CONSENT_REVOKED');
  });

  it('forces re-consent after a material change and binds checks to the new hash', async () => {
    const { inviteToken } = await invite();
    await service.accept(user(GUARDIAN), {
      inviteToken,
      verifiedRelationshipRef: REF,
      idempotencyKey: 'accept-1',
    });
    const oldHash = (
      await service.assertActive(MINOR, ENGAGEMENT)
    ).materialChangeVersionHash;

    const reconsent = (await service.reConsent(user(MINOR), {
      minorId: MINOR,
      engagementId: ENGAGEMENT,
      programId: PROGRAM,
      termsVersion: 2,
      scopes: [ConsentScope.MENTORSHIP, ConsentScope.RECORDING],
      guardianContact: 'guardian@example.com',
      relationship: RelationshipKind.PARENT,
      verifiedRelationshipRef: REF,
      expiresAt: expiresAt(),
      idempotencyKey: 'reconsent-1',
    } as unknown as ReConsentGuardianDto)) as { inviteToken: string };
    expect(reconsent.inviteToken).toBeDefined();

    await expect(
      service.assertActive(MINOR, ENGAGEMENT, [], oldHash),
    ).rejects.toBeInstanceOf(ConflictException);

    await service.accept(user(GUARDIAN), {
      inviteToken: reconsent.inviteToken,
      verifiedRelationshipRef: REF,
      idempotencyKey: 'accept-2',
    });
    const current = await service.assertActive(MINOR, ENGAGEMENT);
    expect(current.materialChangeVersionHash).not.toBe(oldHash);
    expect(current.scopes).toContain(ConsentScope.RECORDING);
  });

  it('hides private fields from snapshots and 404s for unknown engagements', async () => {
    await expect(
      service.snapshot(user(MINOR), ENGAGEMENT),
    ).rejects.toBeInstanceOf(NotFoundException);
    await invite();
    const snapshot = await service.snapshot(user(MINOR), ENGAGEMENT);
    expect(snapshot).not.toHaveProperty('guardianContactHash');
    expect(snapshot).not.toHaveProperty('inviteTokenHash');
    expect(snapshot).not.toHaveProperty('reasonHash');
  });

  it('denies reading another minor’s consent to a regular participant', async () => {
    await invite();
    await expect(
      service.snapshot(user('507f1f77bcf86cd799439099'), ENGAGEMENT, MINOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
