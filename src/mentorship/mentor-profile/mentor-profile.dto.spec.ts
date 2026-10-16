import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpsertMentorProfileDto } from './dto/upsert-mentor-profile.dto';
import { MentorProfileVisibility } from './schemas/mentor-profile.schema';

/** The options `main.ts` applies globally. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: true,
});

const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: UpsertMentorProfileDto });

describe('UpsertMentorProfileDto', () => {
  it('accepts an empty body (a partial draft)', async () => {
    await expect(validate({})).resolves.toBeDefined();
  });

  it('accepts a full body', async () => {
    await expect(
      validate({
        headline: 'Hi',
        bio: 'Bio',
        expertise: ['Rust'],
        languages: ['en'],
        timeZone: 'Africa/Lagos',
        yearsOfExperience: 3,
        teachingApproach: 'Practice',
        links: [{ label: 'Site', url: 'https://example.com' }],
        visibility: MentorProfileVisibility.MEMBERS,
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['an unknown field', { userId: 'someone-else' }],
    ['an over-long headline', { headline: 'h'.repeat(121) }],
    ['an over-long bio', { bio: 'b'.repeat(2001) }],
    ['too many expertise entries', { expertise: Array.from({ length: 16 }, (_, i) => `e${i}`) }],
    ['a non-string expertise entry', { expertise: [1] }],
    ['negative experience', { yearsOfExperience: -1 }],
    ['fractional experience', { yearsOfExperience: 2.5 }],
    ['an unknown visibility', { visibility: 'everyone' }],
    ['a non-https link', { links: [{ label: 'x', url: 'http://example.com' }] }],
    ['a link that is not a URL', { links: [{ label: 'x', url: 'javascript:alert(1)' }] }],
    ['too many links', { links: Array.from({ length: 9 }, () => ({ label: 'x', url: 'https://a.co' })) }],
  ])('rejects %s', async (_label, body) => {
    await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
