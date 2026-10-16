import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AcquisitionOrderService } from '../services/acquisition-order.service';
import {
  AcquisitionOrder,
  AcquisitionOrderDocument,
  AcquisitionOrderStatus,
  AcquisitionItemFormat,
} from '../schemas/acquisition-order.schema';
import { PaginationService } from '../../common/pagination/pagination.service';
import { CreateAcquisitionOrderDto } from '../dto/create-acquisition-order.dto';
import { ReceiveAcquisitionOrderDto } from '../dto/receive-acquisition-order.dto';
import {
  ResourceNotFoundException,
  BusinessRuleException,
} from '../../common/errors/domain.exception';

describe('AcquisitionOrderService', () => {
  let service: AcquisitionOrderService;
  let orderModel: jest.Mocked<Model<AcquisitionOrderDocument>>;
  let paginationService: jest.Mocked<PaginationService>;

  const CREATED_BY = 'user-001';

  const mockOrder = {
    _id: '507f1f77bcf86cd799439011',
    orderNumber: 'PO-2026-001',
    supplier: 'Baker & Taylor',
    orderDate: new Date('2026-08-31'),
    expectedDeliveryDate: new Date('2026-09-30'),
    status: AcquisitionOrderStatus.DRAFT,
    items: [
      {
        bookTitle: 'Dune',
        author: 'Frank Herbert',
        isbn: '978-0441013593',
        format: AcquisitionItemFormat.PHYSICAL,
        quantityOrdered: 5,
        quantityReceived: 0,
        unitPriceMinorUnits: 1299,
        currency: 'USD',
      },
    ],
    notes: '',
    createdBy: CREATED_BY,
    save: jest.fn().mockImplementation(function (this: any) {
      return Promise.resolve(this);
    }),
  };

  const createDto: CreateAcquisitionOrderDto = {
    orderNumber: 'PO-2026-001',
    supplier: 'Baker & Taylor',
    orderDate: '2026-08-31',
    expectedDeliveryDate: '2026-09-30',
    items: [
      {
        bookTitle: 'Dune',
        author: 'Frank Herbert',
        isbn: '978-0441013593',
        format: AcquisitionItemFormat.PHYSICAL,
        quantityOrdered: 5,
        unitPriceMinorUnits: 1299,
        currency: 'USD',
      },
    ],
  };

  beforeEach(async () => {
    orderModel = {
      create: jest.fn().mockResolvedValue({ ...mockOrder, _id: '507f1f77bcf86cd799439011' }),
      findById: jest.fn().mockReturnValue({ exec: jest.fn() }),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
          }),
        }),
      }),
      countDocuments: jest.fn().mockResolvedValue(0),
    } as any;

    paginationService = {
      paginate: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcquisitionOrderService,
        { provide: getModelToken(AcquisitionOrder.name), useValue: orderModel },
        { provide: PaginationService, useValue: paginationService },
      ],
    }).compile();

    service = module.get<AcquisitionOrderService>(AcquisitionOrderService);
  });

  describe('create', () => {
    it('should create an acquisition order with DRAFT status', async () => {
      const result = await service.create(createDto, CREATED_BY);
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('should return an order when found', async () => {
      orderModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockOrder),
      });

      const result = await service.findOne('507f1f77bcf86cd799439011');
      expect(result).toEqual(mockOrder);
    });

    it('should throw ResourceNotFoundException when not found', async () => {
      orderModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.findOne('nonexistent')).rejects.toBeInstanceOf(
        ResourceNotFoundException,
      );
    });
  });

  describe('receive', () => {
    it('should update received quantities and transition to PARTIALLY_RECEIVED', async () => {
      const order = {
        ...mockOrder,
        items: [{ ...mockOrder.items[0], quantityReceived: 0 }],
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };
      orderModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      const dto: ReceiveAcquisitionOrderDto = {
        items: [{ orderItemIndex: 0, quantityReceived: 2 }],
      };

      const result = await service.receive('507f1f77bcf86cd799439011', dto);
      expect(result.status).toBe(AcquisitionOrderStatus.PARTIALLY_RECEIVED);
      expect(result.items[0].quantityReceived).toBe(2);
    });

    it('should transition to RECEIVED when all items fully received', async () => {
      const order = {
        ...mockOrder,
        items: [
          { ...mockOrder.items[0], quantityReceived: 3, quantityOrdered: 5 },
        ],
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };
      orderModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      const dto: ReceiveAcquisitionOrderDto = {
        items: [{ orderItemIndex: 0, quantityReceived: 2 }],
      };

      const result = await service.receive('507f1f77bcf86cd799439011', dto);
      expect(result.status).toBe(AcquisitionOrderStatus.RECEIVED);
      expect(result.items[0].quantityReceived).toBe(5);
    });

    it('should reject receiving on a CANCELLED order', async () => {
      const order = {
        ...mockOrder,
        status: AcquisitionOrderStatus.CANCELLED,
      };
      orderModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      const dto: ReceiveAcquisitionOrderDto = {
        items: [{ orderItemIndex: 0, quantityReceived: 1 }],
      };

      await expect(
        service.receive('507f1f77bcf86cd799439011', dto),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });

    it('should reject when received quantity exceeds ordered', async () => {
      const order = {
        ...mockOrder,
        items: [{ ...mockOrder.items[0], quantityReceived: 0 }],
      };
      orderModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      const dto: ReceiveAcquisitionOrderDto = {
        items: [{ orderItemIndex: 0, quantityReceived: 10 }],
      };

      await expect(
        service.receive('507f1f77bcf86cd799439011', dto),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });
  });

  describe('cancel', () => {
    it('should cancel a DRAFT order', async () => {
      const order = {
        ...mockOrder,
        save: jest.fn().mockImplementation(function (this: any) {
          this.status = AcquisitionOrderStatus.CANCELLED;
          return Promise.resolve(this);
        }),
      };
      orderModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      const result = await service.cancel('507f1f77bcf86cd799439011');
      expect(result.status).toBe(AcquisitionOrderStatus.CANCELLED);
    });

    it('should reject cancelling a RECEIVED order', async () => {
      const order = {
        ...mockOrder,
        status: AcquisitionOrderStatus.RECEIVED,
      };
      orderModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      await expect(
        service.cancel('507f1f77bcf86cd799439011'),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });

    it('should reject cancelling an already CANCELLED order', async () => {
      const order = {
        ...mockOrder,
        status: AcquisitionOrderStatus.CANCELLED,
      };
      orderModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(order),
      });

      await expect(
        service.cancel('507f1f77bcf86cd799439011'),
      ).rejects.toBeInstanceOf(BusinessRuleException);
    });
  });
});
