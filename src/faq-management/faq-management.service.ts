import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CreateFaqManagementDto } from './dto/create-faq-management.dto';
import { UpdateFaqManagementDto } from './dto/update-faq-management.dto';

export const FAQ_CACHE_KEY = '/faq';

@Injectable()
export class FaqManagementService {
  private readonly items: Array<{ id: string } & CreateFaqManagementDto> = [];

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

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

  async create(payload: CreateFaqManagementDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    await this.cache.del(FAQ_CACHE_KEY);
    return created;
  }

  async update(id: string, payload: UpdateFaqManagementDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    await this.cache.del(FAQ_CACHE_KEY);
    await this.cache.del(`${FAQ_CACHE_KEY}/${id}`);
    return item;
  }

  async remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('FaqManagement item not found');
    }
    this.items.splice(index, 1);
    await this.cache.del(FAQ_CACHE_KEY);
    await this.cache.del(`${FAQ_CACHE_KEY}/${id}`);
    return { id, deleted: true };
  }
}
