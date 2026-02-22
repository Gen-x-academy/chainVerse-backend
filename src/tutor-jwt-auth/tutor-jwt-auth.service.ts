import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTutorJwtAuthDto } from './dto/create-tutor-jwt-auth.dto';
import { UpdateTutorJwtAuthDto } from './dto/update-tutor-jwt-auth.dto';

@Injectable()
export class TutorJwtAuthService {
  private readonly items: Array<{ id: string } & CreateTutorJwtAuthDto> = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('TutorJwtAuth item not found');
    }
    return item;
  }

  create(payload: CreateTutorJwtAuthDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateTutorJwtAuthDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('TutorJwtAuth item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
