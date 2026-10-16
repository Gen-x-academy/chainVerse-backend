import { Module } from '@nestjs/common';
import { MentorshipConfigController } from './mentorship-config.controller';
import { MentorshipConfigService } from './mentorship-config.service';

@Module({
  controllers: [MentorshipConfigController],
  providers: [MentorshipConfigService],
  exports: [MentorshipConfigService],
})
export class MentorshipConfigModule {}
