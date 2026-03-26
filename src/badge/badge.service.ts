import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateBadgeDto } from './dto/create-badge.dto';
import { UpdateBadgeDto } from './dto/update-badge.dto';
import { Badge, BadgeDocument } from './schemas/badge.schema';

@Injectable()
export class BadgeService {
  constructor(
    @InjectModel(Badge.name)
    private readonly badgeModel: Model<BadgeDocument>,
  ) {}

  async create(payload: CreateBadgeDto): Promise<Badge> {
    const badge = new this.badgeModel(payload);
    return badge.save();
  }

  async findAll(): Promise<Badge[]> {
    return this.badgeModel.find().exec();
  }

  async findOne(id: string): Promise<BadgeDocument> {
    const badge = await this.badgeModel.findById(id).exec();
    if (!badge) {
      throw new NotFoundException('Badge not found');
    }
    return badge;
  }

  async findByNftTokenId(nftTokenId: string): Promise<Badge | null> {
    return this.badgeModel.findOne({ nftTokenId }).exec();
  }

  async update(id: string, payload: UpdateBadgeDto): Promise<Badge> {
    const badge = await this.badgeModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!badge) {
      throw new NotFoundException('Badge not found');
    }
    return badge;
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.badgeModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Badge not found');
    }
    return { id, deleted: true };
  }
}
