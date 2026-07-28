
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LearningEvent } from './schemas/learning-event.schema';
import { CreateLearningEventDto } from './dto/create-learning-event.dto';

@Injectable()
export class AnalyticsIngestionService {
  constructor(
    @InjectModel(LearningEvent.name)
    private readonly learningEventModel: Model<LearningEvent>,
  ) {}

  async create(
    createLearningEventDto: CreateLearningEventDto,
  ): Promise<LearningEvent> {
    const createdEvent = new this.learningEventModel(createLearningEventDto);
    return createdEvent.save();
  }
}