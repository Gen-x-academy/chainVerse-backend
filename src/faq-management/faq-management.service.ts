import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateFaqManagementDto } from './dto/create-faq-management.dto';
import { UpdateFaqManagementDto } from './dto/update-faq-management.dto';

@Injectable()
export class FaqManagementService {
  private readonly items: Array<{ id: string } & CreateFaqManagementDto> = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('FaqManagement item not found');
    }
    return item;
  }

  create(payload: CreateFaqManagementDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateFaqManagementDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('FaqManagement item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
