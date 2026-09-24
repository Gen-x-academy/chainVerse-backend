import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreatePointsDto } from './dto/create-points.dto';
import { UpdatePointsDto } from './dto/update-points.dto';
import { PointsRecord, PointsRecordDocument } from './schemas/points.schema';
import { CreatePointLedgerEntryDto } from './dto/create-point-ledger-entry.dto';
import {
  LedgerEntryEventType,
  PointLedgerEntry,
  PointLedgerEntryDocument,
} from './schemas/point-ledger-entry.schema';

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
    @InjectModel(PointLedgerEntry.name)
    private readonly ledgerModel: Model<PointLedgerEntryDocument>,
  ) {}

  async createLedgerEntry(
    dto: CreatePointLedgerEntryDto,
  ): Promise<PointLedgerEntryDocument> {
    const amount =
      dto.eventType === LedgerEntryEventType.DEDUCTION
        ? -Math.abs(dto.amount)
        : Math.abs(dto.amount);

    try {
      const entry = await this.ledgerModel.findOneAndUpdate(
        { idempotencyKey: dto.idempotencyKey },
        {
          $setOnInsert: {
            userId: dto.userId,
            eventType: dto.eventType,
            amount,
            source: dto.source,
            idempotencyKey: dto.idempotencyKey,
            referenceId: dto.referenceId ?? null,
            metadata: dto.metadata ?? {},
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      return entry;
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        const existing = await this.ledgerModel.findOne({
          idempotencyKey: dto.idempotencyKey,
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

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

  async getUserBalance(
    userId: string,
  ): Promise<{ userId: string; balance: number }> {
    const result = await this.ledgerModel.aggregate<{ balance: number }>([
      { $match: { userId } },
      { $group: { _id: null, balance: { $sum: '$amount' } } },
    ]);
    const balance = result.length > 0 ? result[0].balance : 0;
    return { userId, balance };
  }

  async getUserLedgerEntries(
    userId: string,
  ): Promise<PointLedgerEntryDocument[]> {
    return this.ledgerModel.find({ userId }).sort({ createdAt: -1 }).exec();
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
