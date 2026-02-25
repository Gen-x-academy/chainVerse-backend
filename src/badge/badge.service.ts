import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateBadgeDto } from './dto/create-badge.dto';
import { UpdateBadgeDto } from './dto/update-badge.dto';

export interface Badge {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  nftTokenId?: string;
  criteria?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class BadgeService {
  private readonly badges: Badge[] = [];

  create(payload: CreateBadgeDto): Badge {
    const badge: Badge = {
      id: crypto.randomUUID(),
      name: payload.name,
      description: payload.description,
      imageUrl: payload.imageUrl,
      nftTokenId: payload.nftTokenId,
      criteria: payload.criteria,
      metadata: payload.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.badges.push(badge);
    return badge;
  }

  findAll(): Badge[] {
    return this.badges;
  }

  findOne(id: string): Badge {
    const badge = this.badges.find((b) => b.id === id);
    if (!badge) {
      throw new NotFoundException('Badge not found');
    }
    return badge;
  }

  findByNftTokenId(nftTokenId: string): Badge | undefined {
    return this.badges.find((b) => b.nftTokenId === nftTokenId);
  }

  update(id: string, payload: UpdateBadgeDto): Badge {
    const badge = this.findOne(id);
    Object.assign(badge, { ...payload, updatedAt: new Date() });
    return badge;
  }

  remove(id: string): { id: string; deleted: boolean } {
    const index = this.badges.findIndex((b) => b.id === id);
    if (index === -1) {
      throw new NotFoundException('Badge not found');
    }
    this.badges.splice(index, 1);
    return { id, deleted: true };
  }
}
