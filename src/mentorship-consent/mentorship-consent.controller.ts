import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ConsentDto, DisputeDto } from './dto/mentorship-consent.dto';
import { MentorshipConsentService } from './mentorship-consent.service';

@ApiTags('Mentorship Consent & Disputes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship')
export class MentorshipConsentController {
  constructor(private readonly service: MentorshipConsentService) {}

  @Post('sessions/:sessionId/consent')
  @ApiOperation({
    summary: 'Set explicit consent for a session (participant only)',
  })
  set(@CurrentUser('sub') actorId: string, @Body() dto: ConsentDto) {
    return this.service.setConsent(actorId, dto);
  }

  @Post('sessions/:sessionId/consent/revoke')
  @ApiOperation({ summary: 'Revoke consent where permitted' })
  revoke(
    @CurrentUser('sub') actorId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.service.revoke(actorId, sessionId);
  }

  @Post('disputes')
  @ApiOperation({
    summary: 'File a completion/attendance/duration/outcome dispute',
  })
  dispute(@Body() dto: DisputeDto) {
    return this.service.createDispute(dto);
  }

  @Patch('disputes/:id/respond')
  respond(
    @CurrentUser('sub') responderId: string,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() body: { response: string },
  ) {
    return this.service.respondDispute(id, responderId, body.response);
  }

  @Patch('disputes/:id/resolve')
  resolve(
    @CurrentUser('sub') resolverId: string,
    @Param('id', new ParseObjectIdPipe()) id: string,
  ) {
    return this.service.resolveDispute(id, resolverId);
  }

  @Get('sessions/:sessionId/disputes')
  list(@Param('sessionId') sessionId: string) {
    return this.service.listDisputesForSession(sessionId);
  }
}
