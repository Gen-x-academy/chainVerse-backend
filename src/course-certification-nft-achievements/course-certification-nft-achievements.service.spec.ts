import { NotFoundException } from '@nestjs/common';
import { CourseCertificationNftAchievementsService } from './course-certification-nft-achievements.service';

describe('CourseCertificationNftAchievementsService', () => {
  let service: CourseCertificationNftAchievementsService;
  let eventEmitter: { emit: jest.Mock };
  let certTxModel: { create: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    eventEmitter = { emit: jest.fn() };
    certTxModel = { create: jest.fn().mockResolvedValue({}) };
    // No Stellar configuration: on-chain issuance is skipped and logged.
    configService = { get: jest.fn().mockReturnValue(undefined) };

    service = new CourseCertificationNftAchievementsService(
      eventEmitter as any,
      {} as any,
      configService as any,
      certTxModel as any,
    );
  });

  it('creates a certificate and emits the certificate issued event', async () => {
    const created = await service.create({
      title: 'Intro to Stellar',
      studentId: 'student-1',
    });

    expect(created.id).toBeDefined();
    expect(service.findAll()).toContain(created);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        certificateId: created.id,
        studentId: 'student-1',
        courseTitle: 'Intro to Stellar',
      }),
    );
  });

  it('does not persist an on-chain transaction when issuance fails', async () => {
    await service.create({ title: 'No chain', studentId: 'student-2' });

    expect(certTxModel.create).not.toHaveBeenCalled();
  });

  it('updates an existing certificate', async () => {
    const created = await service.create({
      title: 'Original',
      studentId: 'student-3',
    });

    const updated = service.update(created.id, { title: 'Updated' });

    expect(updated.title).toBe('Updated');
  });

  it('throws NotFoundException when a certificate is missing', () => {
    expect(() => service.findOne('missing')).toThrow(NotFoundException);
  });

  it('removes an existing certificate', async () => {
    const created = await service.create({
      title: 'Temp',
      studentId: 'student-4',
    });

    expect(service.remove(created.id)).toEqual({
      id: created.id,
      deleted: true,
    });
    expect(service.findAll()).toHaveLength(0);
  });

  it('throws NotFoundException when removing an unknown certificate', () => {
    expect(() => service.remove('missing')).toThrow(NotFoundException);
  });
});
