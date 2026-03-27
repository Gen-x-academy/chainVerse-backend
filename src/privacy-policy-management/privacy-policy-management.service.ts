import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { CreatePrivacyPolicyManagementDto } from './dto/create-privacy-policy-management.dto';
import { UpdatePrivacyPolicyManagementDto } from './dto/update-privacy-policy-management.dto';

export const PRIVACY_POLICY_CACHE_KEY = '/privacy-policy';

@Injectable()
export class PrivacyPolicyManagementService {
  private readonly items: Array<
    { id: string } & CreatePrivacyPolicyManagementDto
  > = [];

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('PrivacyPolicyManagement item not found');
    }
    return item;
  }

  async create(payload: CreatePrivacyPolicyManagementDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    await this.cache.del(PRIVACY_POLICY_CACHE_KEY);
    return created;
  }

  async update(id: string, payload: UpdatePrivacyPolicyManagementDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    await this.cache.del(PRIVACY_POLICY_CACHE_KEY);
    await this.cache.del(`${PRIVACY_POLICY_CACHE_KEY}/${id}`);
    return item;
  }

  async remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('PrivacyPolicyManagement item not found');
    }
    this.items.splice(index, 1);
    await this.cache.del(PRIVACY_POLICY_CACHE_KEY);
    await this.cache.del(`${PRIVACY_POLICY_CACHE_KEY}/${id}`);
    return { id, deleted: true };
  }
}
