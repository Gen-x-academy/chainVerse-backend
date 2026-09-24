import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateRemovalRequestDto } from './dto/create-removal-request.dto';
import { UpdateRemovalRequestDto } from './dto/update-removal-request.dto';
import {
  RemovalRequest,
  RemovalRequestDocument,
} from './schemas/removal-request.schema';

@Injectable()
export class RemovalRequestService {
  constructor(
    @InjectModel(RemovalRequest.name)
    private readonly removalRequestModel: Model<RemovalRequestDocument>,
  ) {}

  async create(
    requestedBy: string,
    payload: CreateRemovalRequestDto,
  ): Promise<RemovalRequest> {
    const request = new this.removalRequestModel({ requestedBy, ...payload });
    return request.save();
  }

  async findAll(): Promise<RemovalRequest[]> {
    return this.removalRequestModel.find().exec();
  }

  async findByUser(userId: string): Promise<RemovalRequest[]> {
    return this.removalRequestModel.find({ requestedBy: userId }).exec();
  }

  async findOne(id: string): Promise<RemovalRequestDocument> {
    const request = await this.removalRequestModel.findById(id).exec();
    if (!request) {
      throw new NotFoundException('Removal request not found');
    }
    return request;
  }

  async moderate(
    id: string,
    payload: UpdateRemovalRequestDto,
  ): Promise<RemovalRequest> {
    const request = await this.findOne(id);
    if (payload.status !== undefined) request.status = payload.status;
    if (payload.adminNotes !== undefined)
      request.adminNotes = payload.adminNotes;
    if (payload.metadata !== undefined) request.metadata = payload.metadata;
    return request.save();
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.removalRequestModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Removal request not found');
    }
    return { id, deleted: true };
  }
}
