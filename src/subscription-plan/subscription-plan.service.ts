import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import {
  SubscriptionPlan,
  SubscriptionPlanDocument,
} from './schemas/subscription-plan.schema';

@Injectable()
export class SubscriptionPlanService {
  constructor(
    @InjectModel(SubscriptionPlan.name)
    private readonly planModel: Model<SubscriptionPlanDocument>,
  ) {}

  async create(payload: CreateSubscriptionPlanDto): Promise<SubscriptionPlan> {
    const plan = new this.planModel(payload);
    return plan.save();
  }

  async findAll(): Promise<SubscriptionPlan[]> {
    return this.planModel.find().exec();
  }

  async findOne(id: string): Promise<SubscriptionPlanDocument> {
    const plan = await this.planModel.findById(id).exec();
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }
    return plan;
  }

  async update(
    id: string,
    payload: UpdateSubscriptionPlanDto,
  ): Promise<SubscriptionPlan> {
    const plan = await this.planModel
      .findByIdAndUpdate(id, payload, { new: true })
      .exec();
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }
    return plan;
  }

  async remove(id: string): Promise<{ id: string; deleted: boolean }> {
    const result = await this.planModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Subscription plan not found');
    }
    return { id, deleted: true };
  }
}
