import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateBadgeDto } from './update-badge.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: true,
});

const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: UpdateBadgeDto });

describe('badge UpdateBadgeDto', () => {
  it('accepts an empty patch and individual fields', async () => {
    await expect(validate({})).resolves.toBeDefined();
    await expect(validate({ description: 'new description' })).resolves.toMatchObject({
      description: 'new description',
    });
  });

  it.each([
    ['an empty name', { name: '' }],
    ['a malformed image URL', { imageUrl: 'javascript:alert(1)' }],
    ['a non-object metadata', { metadata: ['tier'] }],
    ['an unknown field', { id: 'some-id' }],
  ])('rejects %s', async (_label, body) => {
    await expect(validate(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
