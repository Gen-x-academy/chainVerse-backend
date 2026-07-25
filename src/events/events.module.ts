import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { PointsModule } from '../points/points.module';
import { EmailModule } from '../email/email.module';
import { NotificationListener } from './listeners/notification.listener';
import { PointsListener } from './listeners/points.listener';
import { RewardListener } from './listeners/reward.listener';

@Module({
  imports: [NotificationModule, PointsModule, EmailModule],
  providers: [NotificationListener, PointsListener, RewardListener],
})
export class EventsModule {}
