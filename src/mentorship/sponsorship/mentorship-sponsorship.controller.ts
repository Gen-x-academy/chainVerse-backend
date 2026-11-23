import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CreateSponsorshipDto,
  ReserveSponsorshipDto,
} from './dto/sponsorship.dto';
import { MentorshipSponsorshipService } from './mentorship-sponsorship.service';

@ApiTags('Mentorship Sponsorship')
@ApiBearerAuth('access-token')
@Controller('mentorship/sponsorships')
@UseGuards(JwtAuthGuard)
export class MentorshipSponsorshipController {
  constructor(private readonly service: MentorshipSponsorshipService) {}

  @Post()
  @ApiOperation({ summary: 'Create sponsorship' })
  create(@Body() dto: CreateSponsorshipDto) {
    return this.service.create(dto);
  }

  @Post(':id/reservations')
  @ApiOperation({ summary: 'Reserve sponsorship funds (atomic)' })
  reserve(@Param('id') id: string, @Body() dto: ReserveSponsorshipDto) {
    return this.service.reserve(id, dto);
  }

  @Post('reservations/:id/release')
  @ApiOperation({ summary: 'Release unused reservation' })
  release(@Param('id') id: string) {
    return this.service.release(id);
  }

  @Get(':id/report')
  @ApiOperation({ summary: 'Sponsor spend report' })
  report(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.service.report(id, userId);
  }
}
