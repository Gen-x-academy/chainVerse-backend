import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/authenticated-user';
import { JoiValidationPipe } from '../common/joi-validation.pipe';
import { TenantAccessService } from '../common/tenant-access.service';
import {
  CreateScholarshipProgramDto,
  createScholarshipProgramSchema,
  UpdateScholarshipProgramStatusDto,
  updateScholarshipProgramStatusSchema,
} from './dto/program.dto';
import { ScholarshipProgramService } from './scholarship-program.service';

@ApiTags('Scholarship Finance — Programs')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/scholarship-programs')
export class ScholarshipProgramController {
  constructor(
    private readonly programs: ScholarshipProgramService,
    private readonly tenant: TenantAccessService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a scholarship program with its treasury account',
  })
  async create(
    @Param('organizationId') organizationId: string,
    @Body(new JoiValidationPipe(createScholarshipProgramSchema))
    dto: CreateScholarshipProgramDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanWrite(req.user, organizationId);
    return this.programs.create(organizationId, dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List scholarship programs for an organization' })
  async list(
    @Param('organizationId') organizationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanRead(req.user, organizationId);
    return this.programs.findByOrganization(organizationId);
  }

  @Get(':programId')
  @ApiOperation({ summary: 'Get a scholarship program' })
  async get(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanRead(req.user, organizationId);
    return this.programs.get(organizationId, programId);
  }

  @Patch(':programId/status')
  @ApiOperation({ summary: 'Activate, suspend or close a program' })
  async updateStatus(
    @Param('organizationId') organizationId: string,
    @Param('programId') programId: string,
    @Body(new JoiValidationPipe(updateScholarshipProgramStatusSchema))
    dto: UpdateScholarshipProgramStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.tenant.assertCanWrite(req.user, organizationId);
    return this.programs.updateStatus(organizationId, programId, dto);
  }
}
