import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConflictSeverity } from '../conflict.constants';
import {
  DecideWaiverDto,
  RequestWaiverDto,
  RunConflictCheckDto,
} from './conflict.dto';

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

const CHECK = {
  proposalId: 'p'.repeat(24),
  mentorId: 'm'.repeat(24),
  menteeId: 's'.repeat(24),
  facts: {},
  idempotencyKey: 'check-key-0001',
};

describe('Conflict DTOs', () => {
  describe('RunConflictCheckDto', () => {
    it('accepts a valid check with nested declared relationships', async () => {
      await expect(
        validate(
          {
            ...CHECK,
            facts: {
              sharedOrganizationId: 'org-1',
              declaredRelationships: [
                { kind: 'family', severity: ConflictSeverity.HARD, note: 'Cousins' },
              ],
            },
          },
          RunConflictCheckDto,
        ),
      ).resolves.toBeDefined();
    });

    it.each([
      ['a missing mentee', { ...CHECK, menteeId: undefined }],
      ['a non-boolean reporting flag', { ...CHECK, facts: { reportingRelationship: 'yes' } }],
      ['a nested relationship without a note', {
        ...CHECK,
        facts: { declaredRelationships: [{ kind: 'family', severity: ConflictSeverity.HARD }] },
      }],
      ['an unknown nested severity', {
        ...CHECK,
        facts: { declaredRelationships: [{ kind: 'family', severity: 'maybe', note: 'x' }] },
      }],
      ['a short idempotency key', { ...CHECK, idempotencyKey: 'short' }],
      ['an unknown field', { ...CHECK, force: true }],
    ])('rejects %s', async (_label, body) => {
      await expect(validate(body, RunConflictCheckDto)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('waiver DTOs', () => {
    it('accepts valid request and decision bodies', async () => {
      await expect(
        validate(
          {
            checkId: 'c'.repeat(24),
            findingCode: 'REPORTING_LINE',
            reason: 'Separate reporting lines were confirmed.',
            idempotencyKey: 'waiver-key-01',
          },
          RequestWaiverDto,
        ),
      ).resolves.toBeDefined();
      await expect(
        validate({ decision: 'approve', expectedVersion: 1 }, DecideWaiverDto),
      ).resolves.toBeDefined();
    });

    it.each([
      ['an invalid decision', { decision: 'maybe', expectedVersion: 1 }],
      ['a zero version', { decision: 'approve', expectedVersion: 0 }],
      ['an over-long decision note', { decision: 'approve', expectedVersion: 1, decisionNote: 'n'.repeat(2001) }],
    ])('rejects %s from DecideWaiverDto', async (_label, body) => {
      await expect(validate(body, DecideWaiverDto)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
