import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateStudentAccountSettingsDto } from './dto/create-student-account-settings.dto';
import { UpdateStudentAccountSettingsDto } from './dto/update-student-account-settings.dto';

@Injectable()
export class StudentAccountSettingsService {
  private readonly items: Array<
    { id: string } & CreateStudentAccountSettingsDto
  > = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('StudentAccountSettings item not found');
    }
    return item;
  }

  create(payload: CreateStudentAccountSettingsDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdateStudentAccountSettingsDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('StudentAccountSettings item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
