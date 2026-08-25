import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { WebhookLogService } from './webhook-log.service';
import { WebhookLogStatus } from './schemas/webhook-log.schema';

describe('WebhookLogService', () => {
  let service: WebhookLogService;

  const mockSave = jest.fn().mockResolvedValue({});
  const mockFindOneAndUpdate = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue({}),
  });

  const mockModel = jest.fn().mockImplementation(() => ({
    save: mockSave,
  }));
  mockModel.findOneAndUpdate = mockFindOneAndUpdate;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookLogService,
        {
          provide: getModelToken('WebhookLog'),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<WebhookLogService>(WebhookLogService);
  });

  describe('logReceived', () => {
    it('should create a new webhook log entry', async () => {
      await service.logReceived({
        webhookId: 'wh-1',
        source: 'stripe',
        eventType: 'payment.completed',
      });

      expect(mockSave).toHaveBeenCalled();
      expect(mockModel).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookId: 'wh-1',
          source: 'stripe',
          eventType: 'payment.completed',
          status: WebhookLogStatus.RECEIVED,
        }),
      );
    });
  });

  describe('logVerified', () => {
    it('should update status to verified', async () => {
      await service.logVerified('wh-1');

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        { webhookId: 'wh-1' },
        { status: WebhookLogStatus.VERIFIED },
      );
    });
  });

  describe('logProcessed', () => {
    it('should update status to processed with processedAt', async () => {
      await service.logProcessed('wh-1');

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        { webhookId: 'wh-1' },
        expect.objectContaining({
          status: WebhookLogStatus.PROCESSED,
        }),
      );
    });
  });

  describe('logFailed', () => {
    it('should update status to failed with error message', async () => {
      await service.logFailed('wh-1', 'Something went wrong');

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        { webhookId: 'wh-1' },
        expect.objectContaining({
          status: WebhookLogStatus.FAILED,
          error: 'Something went wrong',
        }),
      );
    });
  });

  describe('logRejectedSignature', () => {
    it('should create a log with rejected_signature status', async () => {
      await service.logRejectedSignature('wh-1', 'stripe', 'payment');

      expect(mockSave).toHaveBeenCalled();
      expect(mockModel).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookId: 'wh-1',
          source: 'stripe',
          eventType: 'payment',
          status: WebhookLogStatus.REJECTED_SIGNATURE,
        }),
      );
    });
  });

  describe('logRejectedReplay', () => {
    it('should create a log with rejected_replay status', async () => {
      await service.logRejectedReplay('wh-1', 'stripe', 'payment');

      expect(mockSave).toHaveBeenCalled();
      expect(mockModel).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookId: 'wh-1',
          source: 'stripe',
          eventType: 'payment',
          status: WebhookLogStatus.REJECTED_REPLAY,
        }),
      );
    });
  });
});
