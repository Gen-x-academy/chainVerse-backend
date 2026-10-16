import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContactMessageService } from './contact-message.service';
import {
  ContactMessage,
  ContactMessageDocument,
} from './schemas/contact-message.schema';
import {
  ContactMessageCategory,
  ContactMessagePriority,
  ContactMessageStatus,
} from './enums/contact-message.enums';

const mockContactMessageModel: any = jest.fn();
mockContactMessageModel.find = jest.fn();
mockContactMessageModel.findById = jest.fn();
mockContactMessageModel.findByIdAndUpdate = jest.fn();
mockContactMessageModel.findByIdAndDelete = jest.fn();

const mockMessageDocument = (over: Record<string, unknown> = {}) => ({
  _id: 'msg-1',
  requesterName: 'John Doe',
  requesterEmail: 'john@example.com',
  subject: 'Test Subject',
  body: 'Test body content',
  category: ContactMessageCategory.GENERAL,
  priority: ContactMessagePriority.MEDIUM,
  status: ContactMessageStatus.OPEN,
  assigneeId: null,
  statusHistory: [
    {
      status: ContactMessageStatus.OPEN,
      changedBy: 'system',
      changedAt: new Date(),
      note: 'Message received',
    },
  ],
  toObject() {
    const { toObject, ...rest } = this;
    return { ...rest };
  },
  save: jest.fn(),
  ...over,
});

describe('ContactMessageService', () => {
  let service: ContactMessageService;
  let model: Model<ContactMessageDocument>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactMessageService,
        {
          provide: getModelToken(ContactMessage.name),
          useValue: mockContactMessageModel,
        },
      ],
    }).compile();

    service = module.get<ContactMessageService>(ContactMessageService);
    model = module.get<Model<ContactMessageDocument>>(
      getModelToken(ContactMessage.name),
    );
  });

  describe('create', () => {
    it('creates a message with initial status "open"', async () => {
      const payload = {
        requesterName: 'John Doe',
        requesterEmail: 'john@example.com',
        subject: 'Test',
        body: 'Test body',
      };
      const savedMessage = mockMessageDocument(payload);
      mockContactMessageModel.mockImplementation(function (this: any, data: any) {
        Object.assign(this, data);
        this.save = jest.fn().mockResolvedValue(savedMessage);
      });

      const result = await service.create(payload);

      expect(result).toEqual(savedMessage);
    });
  });

  describe('findAll', () => {
    it('returns sanitized messages for list view', async () => {
      const messages = [
        mockMessageDocument({ requesterEmail: 'john@example.com' }),
        mockMessageDocument({ requesterEmail: 'jane@test.org' }),
      ];
      const mockQuery = {
        exec: jest.fn().mockResolvedValue(messages),
      };
      mockContactMessageModel.find.mockReturnValue(mockQuery);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].requesterEmail).toMatch(/^j\*+@example\.com$/);
      expect(result[1].requesterEmail).toMatch(/^j\*+@test\.org$/);
    });
  });

  describe('findOne', () => {
    it('returns the message when found', async () => {
      const message = mockMessageDocument();
      const mockQuery = { exec: jest.fn().mockResolvedValue(message) };
      mockContactMessageModel.findById.mockReturnValue(mockQuery);

      const result = await service.findOne('msg-1');

      expect(result).toEqual(message);
      expect(mockContactMessageModel.findById).toHaveBeenCalledWith('msg-1');
    });

    it('throws NotFoundException for unknown id', async () => {
      const mockQuery = { exec: jest.fn().mockResolvedValue(null) };
      mockContactMessageModel.findById.mockReturnValue(mockQuery);

      await expect(service.findOne('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates status and adds to status history', async () => {
      const existing = mockMessageDocument({
        status: ContactMessageStatus.OPEN,
      });
      const updated = mockMessageDocument({
        status: ContactMessageStatus.IN_PROGRESS,
      });

      mockContactMessageModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existing),
      });
      mockContactMessageModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updated),
      });

      const result = await service.update(
        'msg-1',
        { status: ContactMessageStatus.IN_PROGRESS },
        'staff-1',
      );

      expect(result.status).toBe(ContactMessageStatus.IN_PROGRESS);
      expect(mockContactMessageModel.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('rejects invalid status transitions', async () => {
      const existing = mockMessageDocument({
        status: ContactMessageStatus.CLOSED,
      });

      mockContactMessageModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existing),
      });

      await expect(
        service.update(
          'msg-1',
          { status: ContactMessageStatus.OPEN },
          'staff-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for unknown id', async () => {
      mockContactMessageModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.update(
          'unknown',
          { status: ContactMessageStatus.IN_PROGRESS },
          'staff-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the message', async () => {
      const mockQuery = {
        exec: jest.fn().mockResolvedValue(mockMessageDocument()),
      };
      mockContactMessageModel.findByIdAndDelete.mockReturnValue(mockQuery);

      const result = await service.remove('msg-1');

      expect(result).toEqual({ id: 'msg-1', deleted: true });
    });

    it('throws NotFoundException for unknown id', async () => {
      const mockQuery = { exec: jest.fn().mockResolvedValue(null) };
      mockContactMessageModel.findByIdAndDelete.mockReturnValue(mockQuery);

      await expect(service.remove('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
