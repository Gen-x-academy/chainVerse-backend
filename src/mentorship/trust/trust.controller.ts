import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { MentorTrustService } from './trust.service';

@ApiTags('Mentor Trust Indicators')
@Controller('mentorship/trust')
export class MentorTrustController {
  constructor(private readonly service: MentorTrustService) {}

  @Public()
  @Get(':mentorId')
  @ApiOperation({
    summary: 'Explainable trust indicators for a mentor (read-only)',
  })
  get(@Param('mentorId', new ParseObjectIdPipe()) mentorId: string) {
    return this.service.getIndicators(mentorId);
  }
}
