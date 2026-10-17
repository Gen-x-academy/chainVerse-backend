import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { MentorAvailabilityService } from './availability.service';
import { SetAvailabilityDto } from './dto/set-availability.dto';

@ApiTags('Mentor Availability')
@ApiBearerAuth('access-token')
@Controller('mentorship/availability')
export class MentorAvailabilityController {
  constructor(private readonly service: MentorAvailabilityService) {}

  @Put('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TUTOR)
  @ApiOperation({
    summary: 'Set (or schedule) the calling mentor’s availability status',
  })
  setMine(
    @Body() dto: SetAvailabilityDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.setAvailability(userId, dto, userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TUTOR)
  @ApiOperation({ summary: 'Current status and scheduled changes' })
  getMine(@CurrentUser('sub') userId: string) {
    return this.service.getOwn(userId);
  }

  @Public()
  @Get(':mentorId')
  @ApiOperation({
    summary: 'Public availability: status, discoverability, application mode',
  })
  getPublic(@Param('mentorId', new ParseObjectIdPipe()) mentorId: string) {
    return this.service.getPublic(mentorId);
  }

  @Get(':mentorId/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Availability audit trail (admin / moderator)' })
  history(@Param('mentorId', new ParseObjectIdPipe()) mentorId: string) {
    return this.service.history(mentorId);
  }
}
