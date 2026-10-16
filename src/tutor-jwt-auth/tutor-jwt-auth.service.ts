import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTutorJwtAuthDto } from './dto/create-tutor-jwt-auth.dto';
import { UpdateTutorJwtAuthDto } from './dto/update-tutor-jwt-auth.dto';
import {
  TutorJwtAuth,
  TutorJwtAuthDocument,
} from './schemas/tutor-jwt-auth.schema';

@Injectable()
export class TutorJwtAuthService {
  constructor(
    @InjectModel(TutorJwtAuth.name)
    private readonly tutorJwtAuthModel: Model<TutorJwtAuthDocument>,
  ) {}

  async findAll() {
    return this.tutorJwtAuthModel.find().exec();
  }

  async findOne(id: string) {
    const item = await this.tutorJwtAuthModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('TutorJwtAuth item not found');
    }
    return item;
  }

  async create(payload: CreateTutorJwtAuthDto) {
    const created = new this.tutorJwtAuthModel(payload);
    return created.save();
  }

  async update(id: string, payload: UpdateTutorJwtAuthDto) {
    const item = await this.tutorJwtAuthModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!item) {
      throw new NotFoundException('TutorJwtAuth item not found');
    }
    return item;
  }

  async remove(id: string) {
    const result = await this.tutorJwtAuthModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('TutorJwtAuth item not found');
    }
    return { id, deleted: true };
  }
}
