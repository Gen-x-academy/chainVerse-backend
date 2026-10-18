import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipActionsController } from './mentorship-actions.controller';
import { MentorshipActionsService } from './mentorship-actions.service';
import {
  MentorshipActionItem,
  MentorshipActionItemSchema,
} from './schemas/mentorship-action-item.schema';
import {
  MentorshipMilestone,
  MentorshipMilestoneSchema,
} from './schemas/mentorship-milestone.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MentorshipActionItem.name, schema: MentorshipActionItemSchema },
      { name: MentorshipMilestone.name, schema: MentorshipMilestoneSchema },
    ]),
  ],
  controllers: [MentorshipActionsController],
  providers: [MentorshipActionsService],
  exports: [MentorshipActionsService],
})
export class MentorshipActionsModule {}
