import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SanctionService } from './sanction.service';
import {
  SanctionStatus,
  SanctionType,
} from './schemas/sanction.schema';
import { AppealDecision } from './dto/review-appeal.dto';

describe('SanctionService', () => {
  let service: SanctionService;
  let sanctionModel: any;

  const buildSanction = (overrides: Record<string, unknown> = {}) => ({
    userId: 'user-1',
    type: SanctionType.WARNING,
    reason: 'spam',
    status: SanctionStatus.ACTIVE,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const found = (sanction: unknown) => ({
    exec: jest.fn().mockResolvedValue(sanction),
  });

  beforeEach(() => {
    sanctionModel = jest.fn().mockImplementation((doc: object) => ({
      ...doc,
      save: jest.fn().mockResolvedValue(doc),
    }));
    sanctionModel.find = jest.fn();
    sanctionModel.findById = jest.fn();

    service = new SanctionService(sanctionModel);
  });

  it('creates a sanction with the issuer attached', async () => {
    const created = await service.create('admin-1', {
      userId: 'user-1',
      type: SanctionType.WARNING,
      reason: 'spam',
    });

    expect(sanctionModel).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', issuedBy: 'admin-1' }),
    );
    expect(created).toMatchObject({ userId: 'user-1', issuedBy: 'admin-1' });
  });

  it('lists sanctions for a user newest-first', async () => {
    const sort = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
    sanctionModel.find.mockReturnValue({ sort });

    await service.findByUser('user-1');

    expect(sanctionModel.find).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('throws NotFoundException for an unknown sanction', async () => {
    sanctionModel.findById.mockReturnValue(found(null));

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('appeals an active sanction', async () => {
    const sanction = buildSanction();
    sanctionModel.findById.mockReturnValue(found(sanction));

    const result = await service.appeal('sanction-1', 'user-1', {
      appealReason: 'It was a mistake',
    });

    expect(result.status).toBe(SanctionStatus.APPEALED);
    expect(result.appealReason).toBe('It was a mistake');
    expect(result.save).toHaveBeenCalled();
  });

  it('rejects an appeal from another user', async () => {
    sanctionModel.findById.mockReturnValue(found(buildSanction()));

    await expect(
      service.appeal('sanction-1', 'someone-else', {
        appealReason: 'Not mine',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an appeal for a sanction that is not active', async () => {
    sanctionModel.findById.mockReturnValue(
      found(buildSanction({ status: SanctionStatus.UPHELD })),
    );

    await expect(
      service.appeal('sanction-1', 'user-1', { appealReason: 'Again' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects reviewing a sanction that is not under appeal', async () => {
    sanctionModel.findById.mockReturnValue(found(buildSanction()));

    await expect(
      service.reviewAppeal('sanction-1', 'admin-1', {
        decision: AppealDecision.OVERTURN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('overturns an appealed sanction', async () => {
    const sanction = buildSanction({ status: SanctionStatus.APPEALED });
    sanctionModel.findById.mockReturnValue(found(sanction));

    const result = await service.reviewAppeal('sanction-1', 'admin-1', {
      decision: AppealDecision.OVERTURN,
      notes: 'Valid appeal',
    });

    expect(result.status).toBe(SanctionStatus.OVERTURNED);
    expect(result.appealReviewedBy).toBe('admin-1');
    expect(result.appealNotes).toBe('Valid appeal');
  });

  it('upholds an appealed sanction', async () => {
    const sanction = buildSanction({ status: SanctionStatus.APPEALED });
    sanctionModel.findById.mockReturnValue(found(sanction));

    const result = await service.reviewAppeal('sanction-1', 'admin-1', {
      decision: AppealDecision.UPHOLD,
    });

    expect(result.status).toBe(SanctionStatus.UPHELD);
  });
});
