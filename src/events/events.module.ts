import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { PointsModule } from '../points/points.module';
import { EmailModule } from '../email/email.module';
import { NotificationListener } from './listeners/notification.listener';
import { PointsListener } from './listeners/points.listener';
import { RewardListener } from './listeners/reward.listener';
import { LearningEventListener } from './listeners/learning-event.listener';
import { StreakListener } from './listeners/streak.listener';
import { CourseAnalyticsModule } from '../course-analytics/course-analytics.module';
import { StreakModule } from '../session/streak.module';

@Module({
  imports: [
    NotificationModule,
    PointsModule,
    EmailModule,
    CourseAnalyticsModule,
    StreakModule,
  ],
  providers: [
    NotificationListener,
    PointsListener,
    RewardListener,
    LearningEventListener,
    StreakListener,
  ],
})
export class EventsModule {}