import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CreateAdminModeratorAccountSettingsDto,
} from './create-admin-moderator-account-settings.dto';
import {
  UpdateAdminModeratorAccountSettingsDto,
} from './update-admin-moderator-account-settings.dto';

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
    metatype: CreateAdminModeratorAccountSettingsDto,
  });

const validateUpdate = (body: unknown) =>
  pipe.transform(body, {
    type: 'body',
    metatype: UpdateAdminModeratorAccountSettingsDto,
  });

describe('AdminModeratorAccountSettings DTOs', () => {
  describe('CreateAdminModeratorAccountSettingsDto', () => {
    it('accepts a minimal valid payload', async () => {
      await expect(validateCreate({ title: 'Moderation settings' })).resolves.toMatchObject({
        title: 'Moderation settings',
      });
    });

    it('accepts an optional description and metadata object', async () => {
      await expect(
        validateCreate({
          title: 'Moderation settings',
          description: 'Escalation rules',
          metadata: { ticket: 'MOD-1' },
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

  describe('UpdateAdminModeratorAccountSettingsDto', () => {
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
