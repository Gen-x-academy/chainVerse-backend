import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  features: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SubscriptionPlanService {
  private readonly plans: SubscriptionPlan[] = [];

  create(payload: CreateSubscriptionPlanDto): SubscriptionPlan {
    const plan: SubscriptionPlan = {
      id: crypto.randomUUID(),
      name: payload.name,
      description: payload.description,
      price: payload.price,
      duration: payload.duration,
      features: payload.features,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.plans.push(plan);
    return plan;
  }

  findAll(): SubscriptionPlan[] {
    return this.plans;
  }

  findOne(id: string): SubscriptionPlan {
    const plan = this.plans.find((p) => p.id === id);
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }
    return plan;
  }

  update(id: string, payload: UpdateSubscriptionPlanDto): SubscriptionPlan {
    const plan = this.findOne(id);
    Object.assign(plan, { ...payload, updatedAt: new Date() });
    return plan;
  }

  remove(id: string): { id: string; deleted: boolean } {
    const index = this.plans.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new NotFoundException('Subscription plan not found');
    }
    this.plans.splice(index, 1);
    return { id, deleted: true };
  }
}
