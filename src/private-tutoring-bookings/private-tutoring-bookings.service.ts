import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePrivateTutoringBookingsDto } from './dto/create-private-tutoring-bookings.dto';
import { UpdatePrivateTutoringBookingsDto } from './dto/update-private-tutoring-bookings.dto';

@Injectable()
export class PrivateTutoringBookingsService {
  private readonly items: Array<{ id: string } & CreatePrivateTutoringBookingsDto> = [];

  findAll() {
    return this.items;
  }

  findOne(id: string) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) {
      throw new NotFoundException('PrivateTutoringBookings item not found');
    }
    return item;
  }

  create(payload: CreatePrivateTutoringBookingsDto) {
    const created = { id: crypto.randomUUID(), ...payload };
    this.items.push(created);
    return created;
  }

  update(id: string, payload: UpdatePrivateTutoringBookingsDto) {
    const item = this.findOne(id);
    Object.assign(item, payload);
    return item;
  }

  remove(id: string) {
    const index = this.items.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new NotFoundException('PrivateTutoringBookings item not found');
    }
    this.items.splice(index, 1);
    return { id, deleted: true };
  }
}
