import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MentorDirectoryQueryDto } from './mentor-directory.dto';
import { MentorDirectoryService } from './mentor-directory.service';

@ApiTags('Mentor Directory')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentors/directory')
export class MentorDirectoryController {
  constructor(private readonly service: MentorDirectoryService) {}

  @Get()
  @ApiOperation({ summary: 'Search published, eligible mentors' })
  search(@Query() query: MentorDirectoryQueryDto) {
    return this.service.search(query);
  }

  @Get(':mentorId')
  @ApiOperation({ summary: 'Get a public mentor profile detail' })
  detail(@Param('mentorId') mentorId: string) {
    return this.service.detail(mentorId);
  }
}
