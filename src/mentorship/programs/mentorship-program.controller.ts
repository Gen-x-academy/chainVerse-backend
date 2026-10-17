import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateMentorshipProgramDto } from './dto/mentorship-program.dto';
import { MentorshipProgramService } from './mentorship-program.service';

@ApiTags('Mentorship Programs')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/programs')
export class MentorshipProgramController {
  constructor(private readonly service: MentorshipProgramService) {}

  @Post()
  @ApiOperation({ summary: 'Create a mentorship program draft' })
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateMentorshipProgramDto) {
    return this.service.create(userId, dto);
  }

  @Get(':programId')
  @ApiOperation({ summary: 'Get an owned mentorship program' })
  get(@CurrentUser('sub') userId: string, @Param('programId') programId: string) {
    return this.service.getOwned(programId, userId);
  }

  @Post(':programId/archive')
  @ApiOperation({ summary: 'Archive an active mentorship program' })
  archive(@CurrentUser('sub') userId: string, @Param('programId') programId: string) {
    return this.service.archive(programId, userId);
  }

  @Post(':programId/clone')
  @ApiOperation({ summary: 'Clone configuration into a new draft' })
  clone(@CurrentUser('sub') userId: string, @Param('programId') programId: string) {
    return this.service.clone(programId, userId);
  }
}
