import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorshipWorkspaceController } from './mentorship-workspace.controller';
import { MentorshipWorkspaceService } from './mentorship-workspace.service';
import {
  MentorshipWorkspace,
  MentorshipWorkspaceSchema,
} from './schemas/mentorship-workspace.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MentorshipWorkspace.name, schema: MentorshipWorkspaceSchema },
    ]),
  ],
  controllers: [MentorshipWorkspaceController],
  providers: [MentorshipWorkspaceService],
  exports: [MentorshipWorkspaceService],
})
export class MentorshipWorkspaceModule {}
