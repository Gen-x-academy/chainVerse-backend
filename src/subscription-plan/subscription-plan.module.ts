import { Module } from '@nestjs/common';
import { SubscriptionPlanController } from './subscription-plan.controller';
import { SubscriptionPlanService } from './subscription-plan.service';

@Module({
  controllers: [SubscriptionPlanController],
  providers: [SubscriptionPlanService],
})
export class SubscriptionPlanModule {}
