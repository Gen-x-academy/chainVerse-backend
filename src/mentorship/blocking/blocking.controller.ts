import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { MentorshipBlockingService } from './blocking.service';
import {
  CreateMentorshipBlockDto,
  MentorshipBlockViewDto,
} from './dto/blocking.dto';

@ApiTags('Mentorship Blocking')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/blocking')
export class MentorshipBlockingController {
  constructor(private readonly blocking: MentorshipBlockingService) {}

  @Post('blocks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Block a user from all mentorship matching with you',
    description:
      'Bidirectional and non-overridable. Repeated calls are idempotent and return the same block. The reason is private to the blocker.',
  })
  @ApiResponse({
    status: 200,
    description: 'Block recorded (or already existed)',
    type: MentorshipBlockViewDto,
  })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT' })
  create(
    @CurrentUser('sub') actorId: string,
    @Body() dto: CreateMentorshipBlockDto,
  ): Promise<MentorshipBlockViewDto> {
    return this.blocking.block(actorId, dto);
  }

  @Get('blocks')
  @ApiOperation({
    summary: 'List only the blocks you created',
    description:
      'Responses omit blocker identity, and private reasons are returned only to their author.',
  })
  @ApiResponse({
    status: 200,
    description: 'Blocks owned by the caller',
    type: [MentorshipBlockViewDto],
  })
  list(
    @CurrentUser('sub') actorId: string,
  ): Promise<MentorshipBlockViewDto[]> {
    return this.blocking.listOwnBlocks(actorId);
  }

  @Delete('blocks/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove one of your own blocks (idempotent)',
    description:
      'Can only remove a block where you are the blocker; no coordinator override path exists.',
  })
  @ApiResponse({ status: 204, description: 'Block removed or absent' })
  @ApiResponse({ status: 403, description: 'MENTOR_ACCESS_DENIED' })
  remove(
    @CurrentUser('sub') actorId: string,
    @Param('userId', new ParseObjectIdPipe()) userId: string,
  ): Promise<{ removed: boolean }> {
    return this.blocking.unblock(actorId, userId);
  }
}
