import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { ApplicationFormService } from '../services/application-form.service';
import {
  CreateApplicationFormDto,
  SubmitFormAnswersDto,
  UpdateApplicationFormDto,
} from '../dto/application-form.dto';

interface AuthenticatedRequest {
  user: { id: string; role: string };
}

/**
 * REST API for managing scholarship application forms.
 *
 * Form lifecycle:  DRAFT → PUBLISHED → ARCHIVED
 *
 * Ownership:  Every form is scoped to a (programId, tenantId) pair.
 *             Admins must supply the correct tenantId in create requests;
 *             the system does not override it from the JWT.
 *
 * Privacy:    Forms do not store PII directly; answers are validated against
 *             the published schema and persisted by the calling application.
 */
@ApiTags('Scholarships – Application Forms')
@ApiBearerAuth('access-token')
@Controller('scholarships/application-forms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationFormController {
  constructor(private readonly formService: ApplicationFormService) {}

  // ── POST / ─────────────────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new application form (DRAFT)' })
  @ApiResponse({ status: 201, description: 'Form created in DRAFT status.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 401, description: 'Unauthenticated.' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions.' })
  create(
    @Body() dto: CreateApplicationFormDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.formService.create(dto, req.user.id);
  }

  // ── GET /program/:programId ────────────────────────────────────────────────

  @Get('program/:programId')
  @Roles(Role.ADMIN, Role.STUDENT)
  @ApiOperation({ summary: 'List all non-archived forms for a programme' })
  @ApiParam({ name: 'programId', description: 'Scholarship programme ID' })
  @ApiResponse({ status: 200, description: 'Array of application forms.' })
  findByProgram(
    @Param('programId') programId: string,
    @Request() req: AuthenticatedRequest & { query: { tenantId?: string } },
  ) {
    // tenantId scoping: admins supply via query string; this is intentionally
    // simple for the MVP — a middleware layer or multi-tenant decorator can
    // enforce stricter isolation in production.
    const tenantId: string =
      (req as unknown as { query: { tenantId?: string } }).query?.tenantId ?? '';
    return this.formService.findByProgram(programId, tenantId);
  }

  // ── GET /:id ───────────────────────────────────────────────────────────────

  @Get(':id')
  @Roles(Role.ADMIN, Role.STUDENT)
  @ApiOperation({ summary: 'Get a single application form by id' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the form' })
  @ApiResponse({ status: 200, description: 'The requested form.' })
  @ApiResponse({ status: 404, description: 'Form not found.' })
  findOne(@Param('id') id: string) {
    return this.formService.findOne(id);
  }

  // ── PATCH /:id ─────────────────────────────────────────────────────────────

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Update a DRAFT form',
    description: 'Only forms in DRAFT status can be updated.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the form' })
  @ApiResponse({ status: 200, description: 'Updated form.' })
  @ApiResponse({ status: 404, description: 'Form not found.' })
  @ApiResponse({ status: 422, description: 'Form is not in DRAFT status.' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationFormDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.formService.update(id, dto, req.user.id);
  }

  // ── POST /:id/publish ──────────────────────────────────────────────────────

  @Post(':id/publish')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Publish a DRAFT form',
    description:
      'Transitions the form from DRAFT to PUBLISHED.  Published forms are immutable.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the form' })
  @ApiResponse({ status: 200, description: 'Published form.' })
  @ApiResponse({ status: 404, description: 'Form not found.' })
  @ApiResponse({ status: 422, description: 'Form is not in DRAFT status.' })
  publish(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.formService.publish(id, req.user.id);
  }

  // ── POST /:id/archive ──────────────────────────────────────────────────────

  @Post(':id/archive')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Archive a PUBLISHED form',
    description: 'Transitions the form from PUBLISHED to ARCHIVED.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the form' })
  @ApiResponse({ status: 200, description: 'Archived form.' })
  @ApiResponse({ status: 404, description: 'Form not found.' })
  @ApiResponse({ status: 422, description: 'Form is not in PUBLISHED status.' })
  archive(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.formService.archive(id, req.user.id);
  }

  // ── POST /:id/validate-answers ─────────────────────────────────────────────

  @Post(':id/validate-answers')
  @Roles(Role.ADMIN, Role.STUDENT)
  @ApiOperation({
    summary: 'Validate applicant answers against the published form schema',
    description:
      'Returns { valid, errors }.  Does not persist answers — callers decide what to do with the result.',
  })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId of the form' })
  @ApiResponse({
    status: 200,
    description: 'Validation result with list of errors (empty when valid).',
  })
  @ApiResponse({ status: 404, description: 'Form not found.' })
  validateAnswers(@Param('id') id: string, @Body() dto: SubmitFormAnswersDto) {
    return this.formService.validateAnswers(id, dto.version, dto.answers);
  }
}
