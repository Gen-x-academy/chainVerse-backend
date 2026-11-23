import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  ConfirmEscrowFundingDto,
  CreateEscrowIntentDto,
} from './dto/escrow.dto';
import { MentorshipEscrowService } from './mentorship-escrow.service';

@ApiTags('Mentorship Escrow')
@ApiBearerAuth('access-token')
@Controller('mentorship/escrow')
@UseGuards(JwtAuthGuard)
export class MentorshipEscrowController {
  constructor(private readonly service: MentorshipEscrowService) {}

  @Post('intents')
  @ApiOperation({ summary: 'Create escrow funding intent (idempotent)' })
  create(@Body() dto: CreateEscrowIntentDto) {
    return this.service.createIntent(dto);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm escrow funding (trusted actor only)' })
  confirm(
    @Body() dto: ConfirmEscrowFundingDto,
    @CurrentUser('sub') userId: string,
    @CurrentUser('roles') roles?: string[],
  ) {
    return this.service.confirm(dto, { userId, roles: roles ?? [] });
  }
}
