import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum';
import { Idempotent } from '../../idempotency/decorators/idempotent.decorator';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { JoiValidationPipe } from '../shared/joi-validation.pipe';
import { MentorshipAuthGuard } from '../shared/mentorship-auth.guard';
import { MentorshipCtx, MentorshipRequestContext } from '../shared/mentorship-context';
import { ANY_ROLE, MentorshipPolicy, STAFF_ROLES } from '../shared/mentorship-policy.decorator';
import { MentorshipProgramsService } from './mentorship-programs.service';
import {
  CreateProgramDto,
  createProgramSchema,
  UpdateProgramDto,
  updateProgramSchema,
  UpsertReviewerDto,
  upsertReviewerSchema,
} from './dto/program.dto';

@ApiTags('Mentorship – Programs')
@ApiBearerAuth('access-token')
@UseGuards(MentorshipAuthGuard)
@UseInterceptors(IdempotencyInterceptor)
@Controller('mentorship/programs')
export class MentorshipProgramsController {
  constructor(private readonly service: MentorshipProgramsService) {}

  @Post()
  @Idempotent()
  @MentorshipPolicy('program.create', [Role.ADMIN, Role.TUTOR])
  @ApiOperation({ summary: 'Create a mentorship program (caller becomes owner)' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: true })
  @ApiBody({ type: CreateProgramDto })
  @ApiResponse({ status: 201, description: 'Program created in draft status' })
  @ApiResponse({ status: 400, description: 'VAL_INVALID_INPUT | MENTOR_UNSAFE_MARKUP | VAL_IDEMPOTENCY_KEY_MISSING' })
  create(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Body(new JoiValidationPipe(createProgramSchema)) dto: CreateProgramDto,
  ) {
    return this.service.create(ctx, dto);
  }

  @Get(':programId')
  @MentorshipPolicy('program.read', ANY_ROLE)
  @ApiOperation({ summary: 'Get a program (open programs are visible to any signed-in user)' })
  @ApiResponse({ status: 404, description: 'MENTOR_PROGRAM_NOT_FOUND' })
  get(@MentorshipCtx() ctx: MentorshipRequestContext, @Param('programId') programId: string) {
    return this.service.get(ctx, programId);
  }

  @Patch(':programId')
  @MentorshipPolicy('program.update', STAFF_ROLES)
  @ApiOperation({ summary: 'Update program settings (owner or admin)' })
  @ApiBody({ type: UpdateProgramDto })
  @ApiResponse({ status: 403, description: 'MENTOR_ACCESS_DENIED' })
  update(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('programId') programId: string,
    @Body(new JoiValidationPipe(updateProgramSchema)) dto: UpdateProgramDto,
  ) {
    return this.service.update(ctx, programId, dto);
  }

  @Get(':programId/reviewers')
  @MentorshipPolicy('program.reviewers.list', STAFF_ROLES)
  @ApiOperation({ summary: 'List scoped reviewers (owner, admin or lead reviewer)' })
  listReviewers(@MentorshipCtx() ctx: MentorshipRequestContext, @Param('programId') programId: string) {
    return this.service.listReviewers(ctx, programId);
  }

  @Put(':programId/reviewers/:reviewerId')
  @MentorshipPolicy('program.reviewers.upsert', STAFF_ROLES)
  @ApiOperation({ summary: 'Scope a user as reviewer/lead, set capacity, or deactivate (idempotent)' })
  @ApiBody({ type: UpsertReviewerDto })
  upsertReviewer(
    @MentorshipCtx() ctx: MentorshipRequestContext,
    @Param('programId') programId: string,
    @Param('reviewerId') reviewerId: string,
    @Body(new JoiValidationPipe(upsertReviewerSchema)) dto: UpsertReviewerDto,
  ) {
    return this.service.upsertReviewer(ctx, programId, reviewerId, dto);
  }
}
