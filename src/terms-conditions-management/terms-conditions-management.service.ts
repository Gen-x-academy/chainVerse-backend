import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTermsConditionsManagementDto } from './dto/create-terms-conditions-management.dto';
import { UpdateTermsConditionsManagementDto } from './dto/update-terms-conditions-management.dto';

@Injectable()
export class TermsConditionsManagementService {
  private readonly items: Array<
    { id: string } & CreateTermsConditionsManagementDto
  > = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('TermsConditionsManagement item not found');
    }
    return item;
  }

  create(payload: CreateTermsConditionsManagementDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateTermsConditionsManagementDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('TermsConditionsManagement item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
