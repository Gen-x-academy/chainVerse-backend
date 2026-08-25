import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PrivateTutoringBooking,
  PrivateTutoringBookingDocument,
} from './schemas/private-tutoring-booking.schema';
import { CreatePrivateTutoringBookingsDto } from './dto/create-private-tutoring-bookings.dto';
import { UpdatePrivateTutoringBookingsDto } from './dto/update-private-tutoring-bookings.dto';

@Injectable()
export class PrivateTutoringBookingsService {
  constructor(
    @InjectModel(PrivateTutoringBooking.name)
    private readonly bookingModel: Model<PrivateTutoringBookingDocument>,
  ) {}

  findAll() {
    return this.bookingModel.find().exec();
  }

  async findOne(id: string) {
    const item = await this.bookingModel.findById(id).exec();
    if (!item)
      throw new NotFoundException('PrivateTutoringBookings item not found');
    return item;
  }

  create(payload: CreatePrivateTutoringBookingsDto) {
    return new this.bookingModel(payload).save();
  }

  async update(id: string, payload: UpdatePrivateTutoringBookingsDto) {
    const item = await this.bookingModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!item)
      throw new NotFoundException('PrivateTutoringBookings item not found');
    return item;
  }

  async remove(id: string) {
    const item = await this.bookingModel.findByIdAndDelete(id).exec();
    if (!item)
      throw new NotFoundException('PrivateTutoringBookings item not found');
    return { id, deleted: true };
  }
}
