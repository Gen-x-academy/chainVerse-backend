import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MentorshipConfig } from './mentorship-config';
import { MentorshipConfigService } from './mentorship-config.service';

@ApiTags('Mentorship Config')
@ApiBearerAuth('access-token')
@Controller('mentorship/config')
export class MentorshipConfigController {
  constructor(private readonly service: MentorshipConfigService) {}

  /** Authenticated (global JwtAuthGuard); contains no secrets. */
  @Get()
  @ApiOperation({
    summary: 'Effective mentorship feature flags and limits (no secrets)',
  })
  get(): MentorshipConfig {
    return this.service.get();
  }
}
