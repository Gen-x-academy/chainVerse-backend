import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { PointsModule } from '../points/points.module';
import { NotificationListener } from './listeners/notification.listener';
import { PointsListener } from './listeners/points.listener';

/**
 * Owns all event listeners.  Importing NotificationModule and PointsModule
 * gives the listeners access to their services without creating any direct
 * dependency between those domain modules themselves.
 */
@Module({
  imports: [NotificationModule, PointsModule],
  providers: [NotificationListener, PointsListener],
})
export class EventsModule {}
