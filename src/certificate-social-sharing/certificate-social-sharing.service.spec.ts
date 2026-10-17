import { NotFoundException } from '@nestjs/common';
import { CertificateSocialSharingService } from './certificate-social-sharing.service';

describe('CertificateSocialSharingService', () => {
  let service: CertificateSocialSharingService;
  let configService: { get: jest.Mock };
  let certTxModel: { findOne: jest.Mock };

  const found = (certificate: unknown) => ({
    exec: jest.fn().mockResolvedValue(certificate),
  });

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('https://chainverse.test/'),
    };
    certTxModel = { findOne: jest.fn() };

    service = new CertificateSocialSharingService(
      configService as any,
      certTxModel as any,
    );
  });

  it('builds share links for an existing certificate', async () => {
    certTxModel.findOne.mockReturnValue(found({ certificateId: 'cert-1' }));

    const result = await service.generateShareLink('cert-1');

    expect(certTxModel.findOne).toHaveBeenCalledWith({
      certificateId: 'cert-1',
    });
    expect(result.shareUrl).toBe('https://chainverse.test/certificates/cert-1');
    expect(result.openGraphUrl).toBe(result.shareUrl);
    expect(result.linkedInUrl).toBe(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
        result.shareUrl,
      )}`,
    );
  });

  it('URL-encodes the certificate id in the share link', async () => {
    certTxModel.findOne.mockReturnValue(found({ certificateId: 'cert 1/2' }));

    const result = await service.generateShareLink('cert 1/2');

    expect(result.shareUrl).toBe(
      'https://chainverse.test/certificates/cert%201%2F2',
    );
  });

  it('throws NotFoundException when the certificate does not exist', async () => {
    certTxModel.findOne.mockReturnValue(found(null));

    await expect(service.generateShareLink('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('omits the base URL when it is not configured', async () => {
    configService.get.mockReturnValue(undefined);
    certTxModel.findOne.mockReturnValue(found({ certificateId: 'cert-1' }));

    const result = await service.generateShareLink('cert-1');

    expect(result.shareUrl).toBe('/certificates/cert-1');
  });
});
