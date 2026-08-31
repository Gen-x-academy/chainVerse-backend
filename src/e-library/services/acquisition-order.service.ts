import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AcquisitionOrder,
  AcquisitionOrderDocument,
  AcquisitionOrderStatus,
} from '../schemas/acquisition-order.schema';
import { CreateAcquisitionOrderDto } from '../dto/create-acquisition-order.dto';
import { ReceiveAcquisitionOrderDto } from '../dto/receive-acquisition-order.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginationService } from '../../common/pagination/pagination.service';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import {
  ResourceNotFoundException,
  BusinessRuleException,
} from '../../common/errors/domain.exception';

@Injectable()
export class AcquisitionOrderService {
  constructor(
    @InjectModel(AcquisitionOrder.name)
    private readonly orderModel: Model<AcquisitionOrderDocument>,
    private readonly paginationService: PaginationService,
  ) {}

  async create(dto: CreateAcquisitionOrderDto, createdBy: string): Promise<AcquisitionOrderDocument> {
    const order = await this.orderModel.create({
      orderNumber: dto.orderNumber,
      supplier: dto.supplier,
      orderDate: new Date(dto.orderDate),
      expectedDeliveryDate: new Date(dto.expectedDeliveryDate),
      status: AcquisitionOrderStatus.DRAFT,
      items: dto.items.map((item) => ({
        bookTitle: item.bookTitle,
        author: item.author,
        isbn: item.isbn ?? '',
        format: item.format,
        quantityOrdered: item.quantityOrdered,
        quantityReceived: 0,
        unitPriceMinorUnits: item.unitPriceMinorUnits,
        currency: item.currency ?? 'USD',
      })),
      notes: dto.notes ?? '',
      createdBy,
    });
    return order;
  }

  async findAll(paginationDto: PaginationDto) {
    return this.paginationService.paginate(this.orderModel, paginationDto);
  }

  async findOne(id: string): Promise<AcquisitionOrderDocument> {
    const order = await this.orderModel.findById(id).exec();
    if (!order) {
      throw new ResourceNotFoundException(
        'Acquisition order not found',
        ErrorCode.RES_ACQUISITION_ORDER_NOT_FOUND,
      );
    }
    return order;
  }

  async receive(
    id: string,
    dto: ReceiveAcquisitionOrderDto,
  ): Promise<AcquisitionOrderDocument> {
    const order = await this.findOne(id);

    if (
      order.status === AcquisitionOrderStatus.RECEIVED ||
      order.status === AcquisitionOrderStatus.CANCELLED
    ) {
      throw new BusinessRuleException(
        `Cannot receive items for an order in ${order.status} status`,
        ErrorCode.BIZ_OVERRIDE_REQUIRES_APPROVAL,
      );
    }

    for (const item of dto.items) {
      if (item.orderItemIndex < 0 || item.orderItemIndex >= order.items.length) {
        throw new BusinessRuleException(
          `Invalid order item index: ${item.orderItemIndex}`,
          ErrorCode.VAL_INVALID_INPUT,
        );
      }
      const orderItem = order.items[item.orderItemIndex];
      const newQty = orderItem.quantityReceived + item.quantityReceived;
      if (newQty > orderItem.quantityOrdered) {
        throw new BusinessRuleException(
          `Received quantity (${newQty}) exceeds ordered quantity (${orderItem.quantityOrdered}) for "${orderItem.bookTitle}"`,
          ErrorCode.VAL_OUT_OF_RANGE,
        );
      }
      orderItem.quantityReceived = newQty;
    }

    const allFullyReceived = order.items.every(
      (item) => item.quantityReceived >= item.quantityOrdered,
    );
    const anyReceived = order.items.some((item) => item.quantityReceived > 0);

    if (allFullyReceived) {
      order.status = AcquisitionOrderStatus.RECEIVED;
    } else if (anyReceived) {
      order.status = AcquisitionOrderStatus.PARTIALLY_RECEIVED;
    }

    return order.save();
  }

  async cancel(id: string): Promise<AcquisitionOrderDocument> {
    const order = await this.findOne(id);

    if (order.status === AcquisitionOrderStatus.RECEIVED) {
      throw new BusinessRuleException(
        'Cannot cancel a fully received order',
        ErrorCode.BIZ_OVERRIDE_REQUIRES_APPROVAL,
      );
    }
    if (order.status === AcquisitionOrderStatus.CANCELLED) {
      throw new BusinessRuleException(
        'Order is already cancelled',
        ErrorCode.BIZ_OVERRIDE_ALREADY_RESOLVED,
      );
    }

    order.status = AcquisitionOrderStatus.CANCELLED;
    return order.save();
  }
}
