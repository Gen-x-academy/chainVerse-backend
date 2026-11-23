import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CreateAdminFinancialAidManagementDto,
} from './create-admin-financial-aid-management.dto';
import {
  UpdateAdminFinancialAidManagementDto,
} from './update-admin-financial-aid-management.dto';

/** The options `main.ts` applies globally. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: true,
});

const validateCreate = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: CreateAdminFinancialAidManagementDto,
  });

const validateUpdate = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: UpdateAdminFinancialAidManagementDto,
  });

describe('AdminFinancialAidManagement DTOs', () => {
  describe('CreateAdminFinancialAidManagementDto', () => {
    it('accepts a minimal valid payload', async () => {
      await expect(validateCreate({ title: 'Aid guidelines' })).resolves.toMatchObject({
        title: 'Aid guidelines',
      });
    });

    it('accepts an optional description and metadata object', async () => {
      await expect(
        validateCreate({
          title: 'Aid guidelines',
          description: 'Eligibility thresholds',
          metadata: { academicYear: 2026 },
        }),
      ).resolves.toBeDefined();
    });

    it.each([
      ['a missing title', {}],
      ['a non-string title', { title: 42 }],
      ['an empty title', { title: '' }],
      ['an over-long title', { title: 't'.repeat(201) }],
      ['a non-string description', { title: 'ok', description: 7 }],
      ['an over-long description', { title: 'ok', description: 'd'.repeat(2001) }],
      ['a non-object metadata', { title: 'ok', metadata: 'not-an-object' }],
      ['an unknown field', { title: 'ok', unexpected: true }],
    ])('rejects %s', async (_label, body) => {
      await expect(validateCreate(body)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('UpdateAdminFinancialAidManagementDto', () => {
    it('accepts an empty body (all fields are optional)', async () => {
      await expect(validateUpdate({})).resolves.toBeDefined();
    });

    it('accepts a partial body', async () => {
      await expect(validateUpdate({ description: 'Updated' })).resolves.toBeDefined();
    });

    it('still validates fields that are supplied', async () => {
      await expect(validateUpdate({ title: 42 })).rejects.toBeInstanceOf(BadRequestException);
      await expect(validateUpdate({ metadata: [] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(validateUpdate({ unexpected: true })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
