import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateMentorshipBlockDto } from './blocking.dto';

/** Mirrors the global ValidationPipe configured in src/main.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: true,
});

const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: CreateMentorshipBlockDto });

const OTHER_USER = '507f1f77bcf86cd799439011';

describe('CreateMentorshipBlockDto', () => {
  it('accepts a minimal block and a block with a private reason', async () => {
    await expect(validate({ blockedUserId: OTHER_USER })).resolves.toMatchObject({
      blockedUserId: OTHER_USER,
    });
    await expect(
      validate({ blockedUserId: OTHER_USER, reason: 'Safety concern' }),
    ).resolves.toMatchObject({ reason: 'Safety concern' });
  });

  it.each([
    ['a missing target', { reason: 'x' }],
    ['a malformed target id', { blockedUserId: 'not-an-id' }],
    ['an empty reason', { blockedUserId: OTHER_USER, reason: '' }],
    ['an over-long reason', { blockedUserId: OTHER_USER, reason: 'r'.repeat(501) }],
    ['a non-string reason', { blockedUserId: OTHER_USER, reason: null }],
    ['an unknown field', { blockedUserId: OTHER_USER, blockerId: 'someone-else' }],
  ])('rejects %s', async (_label, body) => {
    await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('must not accept a blockerId field that could impersonate the author', async () => {
    await expect(
      validate({ blockedUserId: OTHER_USER, blockerId: OTHER_USER }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
