import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateBadgeDto } from './create-badge.dto';

/** Mirrors the global ValidationPipe configured in src/main.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: true,
});

const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: CreateBadgeDto });

describe('badge CreateBadgeDto', () => {
  it('accepts a minimal and a full payload', async () => {
    await expect(validate({ name: 'Mentor' })).resolves.toMatchObject({
      name: 'Mentor',
    });
    await expect(
      validate({
        name: 'Top Mentor',
        description: 'Awarded for outstanding mentoring',
        imageUrl: 'https://cdn.example.com/badges/mentor.png',
        nftTokenId: '12345',
        criteria: 'Completed 10 mentorships',
        metadata: { tier: 'gold' },
      }),
    ).resolves.toMatchObject({ nftTokenId: '12345' });
  });

  it.each([
    ['a missing name', { description: 'no name' }],
    ['an empty name', { name: '' }],
    ['an over-long name', { name: 'n'.repeat(121) }],
    ['a non-string name', { name: null }],
    ['an over-long description', { name: 'ok', description: 'd'.repeat(2001) }],
    ['a malformed image URL', { name: 'ok', imageUrl: 'not-a-url' }],
    ['an over-long nftTokenId', { name: 'ok', nftTokenId: 'x'.repeat(257) }],
    ['an over-long criteria', { name: 'ok', criteria: 'c'.repeat(2001) }],
    ['a non-object metadata', { name: 'ok', metadata: 123 }],
    ['an unknown field', { name: 'ok', createdBy: 'someone-else' }],
  ])('rejects %s', async (_label, body) => {
    await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
