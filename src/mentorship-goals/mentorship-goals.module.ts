import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipGoalsController } from './mentorship-goals.controller';
import { MentorshipGoalsService } from './mentorship-goals.service';
import {
  MentorshipGoal,
  MentorshipGoalSchema,
} from './schemas/mentorship-goal.schema';
import {
  MentorshipGoalCheckin,
  MentorshipGoalCheckinSchema,
} from './schemas/mentorship-goal-checkin.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MentorshipGoal.name, schema: MentorshipGoalSchema },
      { name: MentorshipGoalCheckin.name, schema: MentorshipGoalCheckinSchema },
    ]),
  ],
  controllers: [MentorshipGoalsController],
  providers: [MentorshipGoalsService],
  exports: [MentorshipGoalsService],
})
export class MentorshipGoalsModule {}
