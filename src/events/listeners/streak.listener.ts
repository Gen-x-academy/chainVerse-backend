import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvents } from '../event-names';
import { LearningActivityPayload } from '../payloads/learning-activity.payload';
import { StreakService } from '../../session/streak.service';

@Injectable()
export class StreakListener {
  constructor(private readonly streakService: StreakService) {}

  @OnEvent(DomainEvents.LEARNING_ACTIVITY)
  async onLearningActivity(payload: LearningActivityPayload): Promise<void> {
    await this.streakService.recordActivity(
      payload.userId,
      payload.timezone ?? 'UTC',
    );
  }
}
