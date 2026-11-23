import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCertificateSocialSharingDto } from './update-certificate-social-sharing.dto';

const parse = (payload: unknown) =>
  plainToInstance(UpdateCertificateSocialSharingDto, payload);

describe('UpdateCertificateSocialSharingDto', () => {
  it('accepts an empty patch (every field is optional)', async () => {
    await expect(validate(parse({}))).resolves.toEqual([]);
  });

  it('accepts a valid patch', async () => {
    const errors = await validate(
      parse({
        title: 'My certificate',
        description: 'Issued by Gen-x Academy',
        metadata: { cohort: '2026' },
      }),
    );
    expect(errors).toEqual([]);
  });

  it.each([
    ['a non-string title', { title: 42 }],
    ['an empty title', { title: '' }],
    ['an over-long title', { title: 't'.repeat(201) }],
    ['a non-string description', { description: false }],
    ['an over-long description', { description: 'd'.repeat(2001) }],
    ['a primitive metadata value', { metadata: 'not-an-object' }],
    ['an array metadata value', { metadata: ['not', 'an', 'object'] }],
  ])('rejects %s', async (_label, payload) => {
    const errors = await validate(parse(payload));
    expect(errors.length).toBeGreaterThan(0);
  });
});
