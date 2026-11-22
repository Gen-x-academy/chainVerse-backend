import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CapacityScope } from '../capacity.constants';
import { DefineCapacityPolicyDto, ReserveCapacityDto } from './capacity.dto';

/** The options `main.ts` applies globally. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: true,
});

const validate = <T extends object>(body: unknown, metatype: new () => T) =>
  pipe.transform(body, { type: 'body', metatype });

const VALID_POLICY = {
  scope: CapacityScope.GLOBAL,
  maxConcurrentEngagements: 3,
  maxWeeklyHours: 10,
  maxPrograms: 2,
  maxCohortsPerProgram: 2,
  reservedProposalCapacity: 2,
  expectedVersion: 0,
};

describe('Capacity DTOs', () => {
  describe('DefineCapacityPolicyDto', () => {
    it('accepts a valid global policy', async () => {
      await expect(validate(VALID_POLICY, DefineCapacityPolicyDto)).resolves.toMatchObject({
        scope: CapacityScope.GLOBAL,
      });
    });

    it('requires targetId for a scoped policy', async () => {
      await expect(
        validate({ ...VALID_POLICY, scope: CapacityScope.PROGRAM }, DefineCapacityPolicyDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        validate(
          { ...VALID_POLICY, scope: CapacityScope.PROGRAM, targetId: 'p'.repeat(24) },
          DefineCapacityPolicyDto,
        ),
      ).resolves.toBeDefined();
    });

    it.each([
      ['a missing scope', { ...VALID_POLICY, scope: undefined }],
      ['an unknown scope', { ...VALID_POLICY, scope: 'everywhere' }],
      ['zero concurrent engagements', { ...VALID_POLICY, maxConcurrentEngagements: 0 }],
      ['fractional program count', { ...VALID_POLICY, maxPrograms: 1.5 }],
      ['negative weekly hours', { ...VALID_POLICY, maxWeeklyHours: -1 }],
      ['a missing expectedVersion', { ...VALID_POLICY, expectedVersion: undefined }],
      ['a non-boolean pause', { ...VALID_POLICY, paused: 'yes' }],
      ['an invalid pause expiry', { ...VALID_POLICY, pauseExpiresAt: 'not-a-date' }],
      ['an unknown field', { ...VALID_POLICY, bypass: true }],
    ])('rejects %s', async (_label, body) => {
      await expect(validate(body, DefineCapacityPolicyDto)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('ReserveCapacityDto', () => {
    const valid = {
      proposalId: 'p'.repeat(24),
      mentorId: 'm'.repeat(24),
      programId: 'g'.repeat(24),
      weeklyHours: 2,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      idempotencyKey: 'reserve-key-01',
    };

    it('accepts a valid reservation', async () => {
      await expect(validate(valid, ReserveCapacityDto)).resolves.toMatchObject({
        mentorId: valid.mentorId,
      });
    });

    it.each([
      ['a missing proposalId', { ...valid, proposalId: undefined }],
      ['negative weekly hours', { ...valid, weeklyHours: -1 }],
      ['a non-numeric weekly hours', { ...valid, weeklyHours: 'lots' }],
      ['an invalid expiry', { ...valid, expiresAt: 'tomorrow' }],
      ['a short idempotency key', { ...valid, idempotencyKey: 'short' }],
      ['an unknown field', { ...valid, force: true }],
    ])('rejects %s', async (_label, body) => {
      await expect(validate(body, ReserveCapacityDto)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
