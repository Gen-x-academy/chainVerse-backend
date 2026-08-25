import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { IdempotencyService, IdempotencyCheckStatus } from './idempotency.service';
import { IdempotencyKey } from './schemas/idempotency-key.schema';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let model: any;

  const mockModel = {
    findOne: jest.fn(),
    updateOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: getModelToken(IdempotencyKey.name), useValue: mockModel },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    model = module.get(getModelToken(IdempotencyKey.name));
  });

  describe('check', () => {
    it('returns NEW when no record exists', async () => {
      model.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

      const result = await service.check('key-1', 'user-1', '/loans/checkout', 'hash-1');

      expect(result.status).toBe(IdempotencyCheckStatus.NEW);
      expect(model.findOne).toHaveBeenCalledWith({
        key: 'key-1',
        userId: 'user-1',
        path: '/loans/checkout',
      });
    });

    it('returns REPLAY with the cached response when the hash matches', async () => {
      model.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          requestHash: 'hash-1',
          statusCode: 201,
          responseBody: { loanId: 'loan-1' },
        }),
      });

      const result = await service.check('key-1', 'user-1', '/loans/checkout', 'hash-1');

      expect(result.status).toBe(IdempotencyCheckStatus.REPLAY);
      expect(result.cached).toEqual({ statusCode: 201, responseBody: { loanId: 'loan-1' } });
    });

    it('returns CONFLICT when the same key is reused with a different payload', async () => {
      model.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          requestHash: 'hash-1',
          statusCode: 201,
          responseBody: { loanId: 'loan-1' },
        }),
      });

      const result = await service.check('key-1', 'user-1', '/loans/checkout', 'hash-2');

      expect(result.status).toBe(IdempotencyCheckStatus.CONFLICT);
      expect(result.cached).toBeUndefined();
    });
  });

  describe('save', () => {
    it('upserts a record scoped to key + userId + path', async () => {
      model.updateOne.mockResolvedValue({});

      await service.save('key-1', 'user-1', '/loans/checkout', 'hash-1', 201, { loanId: 'loan-1' });

      expect(model.updateOne).toHaveBeenCalledWith(
        { key: 'key-1', userId: 'user-1', path: '/loans/checkout' },
        {
          $setOnInsert: expect.objectContaining({
            key: 'key-1',
            userId: 'user-1',
            path: '/loans/checkout',
            requestHash: 'hash-1',
            statusCode: 201,
            responseBody: { loanId: 'loan-1' },
          }),
        },
        { upsert: true },
      );
    });
  });
});
