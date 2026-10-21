import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../../common/enums/role.enum';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Idempotent } from '../../../idempotency/decorators/idempotent.decorator';
import { IdempotencyInterceptor } from '../../../idempotency/idempotency.interceptor';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-object-id.pipe';
import { Actor, MentorshipAccessGuard } from '../../mentorship-access.guard';
import type { MentorshipActor } from '../../mentorship.policy';
import {
  DisputeQueryDto,
  ResolveDisputeDto,
} from '../dto/mentorship-operations-query.dto';
import { MentorshipDisputesService } from '../services/mentorship-disputes.service';

@ApiTags('Mentorship Disputes')
@ApiBearerAuth('access-token')
@UseGuards(MentorshipAccessGuard)
@UseInterceptors(IdempotencyInterceptor)
@Roles(Role.ADMIN, Role.MODERATOR)
@Controller('mentorship/disputes')
export class MentorshipDisputesController {
  constructor(private readonly disputes: MentorshipDisputesService) {}

  @ApiOperation({ summary: 'List disputes (coordinator view)' })
  @ApiResponse({ status: 200, description: 'Paginated dispute list' })
  @Get()
  list(@Query() query: DisputeQueryDto) {
    return this.disputes.list(query);
  }

  @ApiOperation({ summary: 'Resolve a dispute (admin only in practice)' })
  @Idempotent()
  @Put(':id/resolve')
  resolve(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: ResolveDisputeDto,
    @Actor() actor: MentorshipActor,
  ) {
    return this.disputes.resolve(id, dto, actor);
  }

  @ApiOperation({ summary: 'Escalate a dispute' })
  @Post(':id/escalate')
  escalate(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: ResolveDisputeDto,
    @Actor() actor: MentorshipActor,
  ) {
    return this.disputes.escalate(id, dto, actor);
  }
}
