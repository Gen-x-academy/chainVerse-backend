import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateGamificationPointsDto } from './dto/create-gamification-points.dto';
import { UpdateGamificationPointsDto } from './dto/update-gamification-points.dto';

@Injectable()
export class GamificationPointsService {
  private readonly items: Array<{ id: string } & CreateGamificationPointsDto> = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('GamificationPoints item not found');
    }
    return item;
  }

  create(payload: CreateGamificationPointsDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateGamificationPointsDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('GamificationPoints item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
