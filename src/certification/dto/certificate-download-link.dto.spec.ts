import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CertificateDownloadLinkDto } from './certificate-download-link.dto';

/** Mirrors the global ValidationPipe options configured in src/main.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  stopAtFirstError: true,
});

const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: CertificateDownloadLinkDto });

const goodPayload = () => ({
  downloadUrl:
    'http://localhost:3000/api/v1/certification/cert-abc/download?token=eyJhbGci...',
  expiresAt: '2026-08-24T12:00:00.000Z',
  expiresIn: 3600,
});

describe('CertificateDownloadLinkDto', () => {
  it('accepts a valid download link payload', async () => {
    const result = await validate(goodPayload());
    expect(result).toBeInstanceOf(CertificateDownloadLinkDto);
    expect(result.expiresIn).toBe(3600);
  });

  it.each([
    ['a non-URL downloadUrl', { downloadUrl: 'not-a-url' }],
    ['a non-string downloadUrl', { downloadUrl: 42 }],
    ['an invalid expiresAt date', { expiresAt: 'not-a-date' }],
    ['a negative expiresIn', { expiresIn: -1 }],
    ['a non-numeric expiresIn', { expiresIn: 'soon' }],
    ['a missing field', { expiresIn: undefined }],
    ['an unknown field', { token: 'secret' }],
  ])('rejects %s', async (_label, patch) => {
    await expect(validate({ ...goodPayload(), ...patch })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
