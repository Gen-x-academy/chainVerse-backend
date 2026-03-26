import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreatePointsDto } from './dto/create-points.dto';
import { UpdatePointsDto } from './dto/update-points.dto';
import { PointsRecord, PointsRecordDocument } from './schemas/points.schema';

export interface UserPointsSummary {
  userId: string;
  totalPoints: number;
  records: PointsRecord[];
}

@Injectable()
export class PointsService {
  constructor(
    @InjectModel(PointsRecord.name)
    private readonly pointsModel: Model<PointsRecordDocument>,
  ) {}

  async awardPoints(payload: CreatePointsDto): Promise<PointsRecord> {
    const record = new this.pointsModel(payload);
    return record.save();
  }

  async findAll(): Promise<PointsRecord[]> {
    return this.pointsModel.find().exec();
  }

  async findOne(id: string): Promise<PointsRecordDocument> {
    const record = await this.pointsModel.findById(id).exec();
    if (!record) {
      throw new NotFoundException('Points record not found');
    }
    return record;
  }

  async getUserPoints(userId: string): Promise<UserPointsSummary> {
    const records = await this.pointsModel.find({ userId }).exec();
    const totalPoints = records.reduce((sum, r) => sum + r.points, 0);
    return { userId, totalPoints, records };
  }

  async update(id: string, payload: UpdatePointsDto): Promise<PointsRecord> {
    const record = await this.pointsModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!record) {
      throw new NotFoundException('Points record not found');
    }
    return record;
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.pointsModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Points record not found');
    }
    return { id, deleted: true };
  }
}
