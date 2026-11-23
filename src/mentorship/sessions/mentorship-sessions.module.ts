import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipSessionsController } from './mentorship-sessions.controller';
import { MentorshipSessionsService } from './mentorship-sessions.service';
import {
  MentorshipSession,
  MentorshipSessionSchema,
} from './schemas/mentorship-session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MentorshipSession.name, schema: MentorshipSessionSchema },
    ]),
  ],
  controllers: [MentorshipSessionsController],
  providers: [MentorshipSessionsService],
  exports: [MentorshipSessionsService],
})
export class MentorshipSessionsModule {}
