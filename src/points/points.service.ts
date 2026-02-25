import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePointsDto } from './dto/create-points.dto';
import { UpdatePointsDto } from './dto/update-points.dto';

export interface PointsRecord {
  id: string;
  userId: string;
  points: number;
  reason: string;
  activityType: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPointsSummary {
  userId: string;
  totalPoints: number;
  records: PointsRecord[];
}

@Injectable()
export class PointsService {
  private readonly records: PointsRecord[] = [];

  awardPoints(payload: CreatePointsDto): PointsRecord {
    const record: PointsRecord = {
      id: crypto.randomUUID(),
      userId: payload.userId,
      points: payload.points,
      reason: payload.reason,
      activityType: payload.activityType,
      metadata: payload.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.records.push(record);
    return record;
  }

  findAll(): PointsRecord[] {
    return this.records;
  }

  findOne(id: string): PointsRecord {
    const record = this.records.find((r) => r.id === id);
    if (!record) {
      throw new NotFoundException('Points record not found');
    }
    return record;
  }

  getUserPoints(userId: string): UserPointsSummary {
    const userRecords = this.records.filter((r) => r.userId === userId);
    const totalPoints = userRecords.reduce((sum, r) => sum + r.points, 0);
    return { userId, totalPoints, records: userRecords };
  }

  update(id: string, payload: UpdatePointsDto): PointsRecord {
    const record = this.findOne(id);
    Object.assign(record, { ...payload, updatedAt: new Date() });
    return record;
  }

  remove(id: string): { id: string; deleted: boolean } {
    const index = this.records.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new NotFoundException('Points record not found');
    }
    this.records.splice(index, 1);
    return { id, deleted: true };
  }
}
