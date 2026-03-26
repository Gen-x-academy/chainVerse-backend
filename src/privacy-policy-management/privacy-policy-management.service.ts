import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePrivacyPolicyManagementDto } from './dto/create-privacy-policy-management.dto';
import { UpdatePrivacyPolicyManagementDto } from './dto/update-privacy-policy-management.dto';

@Injectable()
export class PrivacyPolicyManagementService {
  private readonly items: Array<
    { id: string } & CreatePrivacyPolicyManagementDto
  > = [];

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

  create(payload: CreatePrivacyPolicyManagementDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdatePrivacyPolicyManagementDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('PrivacyPolicyManagement item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
