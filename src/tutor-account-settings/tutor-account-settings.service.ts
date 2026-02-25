import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTutorAccountSettingsDto } from './dto/create-tutor-account-settings.dto';
import { UpdateTutorAccountSettingsDto } from './dto/update-tutor-account-settings.dto';

@Injectable()
export class TutorAccountSettingsService {
  private readonly items: Array<
    { id: string } & CreateTutorAccountSettingsDto
  > = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('TutorAccountSettings item not found');
    }
    return item;
  }

  create(payload: CreateTutorAccountSettingsDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateTutorAccountSettingsDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('TutorAccountSettings item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
