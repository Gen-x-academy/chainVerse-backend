import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { UpsertMentorProfileDto } from './dto/upsert-mentor-profile.dto';
import { MentorProfileService } from './mentor-profile.service';

/**
 * Mentor professional profiles. Every route requires a signed-in user; the "me" routes
 * act only on the caller's own profile, so there is no id to tamper with.
 */
@ApiTags('Mentor Profiles')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentors')
export class MentorProfileController {
  constructor(private readonly service: MentorProfileService) {}

  @Get('me/profile')
  @ApiOperation({ summary: 'Get my mentor profile (draft and published copy)' })
  getOwn(@CurrentUser('sub') userId: string) {
    return this.service.getOwn(userId);
  }

  @Put('me/profile')
  @ApiOperation({
    summary: 'Save my mentor profile draft (full replace; repeating it changes nothing)',
  })
  saveDraft(@CurrentUser('sub') userId: string, @Body() dto: UpsertMentorProfileDto) {
    return this.service.saveDraft(userId, dto);
  }

  @Post('me/profile/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish my current draft (requires a complete profile)' })
  publish(@CurrentUser('sub') userId: string) {
    return this.service.publish(userId);
  }

  @Post('me/profile/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take my profile out of view; the draft is kept' })
  unpublish(@CurrentUser('sub') userId: string) {
    return this.service.unpublish(userId);
  }

  @Get('me/profile/revisions')
  @ApiOperation({ summary: 'My profile change history, newest first' })
  listRevisions(
    @CurrentUser('sub') userId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.service.listRevisions(userId, limit);
  }

  @Get(':profileId/profile')
  @ApiOperation({ summary: "View another mentor's published profile (permitted fields only)" })
  getVisible(
    @Param('profileId', new ParseObjectIdPipe()) profileId: string,
    @CurrentUser('sub') viewerId: string,
  ) {
    return this.service.getVisible(profileId, viewerId);
  }
}
