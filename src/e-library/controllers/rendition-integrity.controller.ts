import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { RenditionIntegrityService } from '../services/rendition-integrity.service';
import {
  IntegrityJobQueryDto,
  IntegrityRenditionQueryDto,
  QuarantineRenditionDto,
  RegisterChecksumDto,
  ResolveQuarantineDto,
  VerifyJobOptionsDto,
} from '../dto/integrity.dto';

@ApiTags('E-Library File Integrity')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.LIBRARIAN, Role.MODERATOR)
@Controller(['library/integrity', 'v1/library/integrity'])
export class RenditionIntegrityController {
  constructor(
    private readonly integrityService: RenditionIntegrityService,
  ) {}

  @Post('renditions')
  @ApiOperation({ summary: 'Register a recorded checksum for a digital rendition' })
  @ApiResponse({ status: 201, description: 'Checksum registered (unverified)' })
  @ApiResponse({ status: 409, description: 'Checksum already registered for this rendition' })
  @ApiResponse({ status: 422, description: 'Invalid checksum or size' })
  registerChecksum(@Body() dto: RegisterChecksumDto) {
    return this.integrityService.registerChecksum(dto);
  }

  @Get('renditions')
  @ApiOperation({ summary: 'List integrity records with filters' })
  @ApiResponse({ status: 200, description: 'Matching integrity records' })
  listRenditions(@Query() dto: IntegrityRenditionQueryDto) {
    return this.integrityService.listRenditions(
      {
        status: dto.status,
        editionId: dto.editionId,
        renditionId: dto.renditionId,
      },
      { page: dto.page, limit: dto.limit },
    );
  }

  @Get('renditions/:renditionId')
  @ApiOperation({ summary: 'View one integrity record' })
  @ApiParam({ name: 'renditionId', description: 'Rendition identifier' })
  @ApiResponse({ status: 200, description: 'The integrity record' })
  @ApiResponse({ status: 404, description: 'No integrity record for the rendition' })
  getRendition(@Param('renditionId') renditionId: string) {
    return this.integrityService.getRendition(renditionId);
  }

  @Post('renditions/:renditionId/quarantine')
  @ApiOperation({ summary: 'Manually quarantine a rendition' })
  @ApiParam({ name: 'renditionId', description: 'Rendition identifier' })
  @ApiResponse({ status: 201, description: 'Rendition quarantined' })
  @ApiResponse({ status: 404, description: 'No integrity record for the rendition' })
  @ApiResponse({ status: 409, description: 'Rendition already quarantined' })
  quarantine(
    @Param('renditionId') renditionId: string,
    @Body() dto: QuarantineRenditionDto,
  ) {
    return this.integrityService.quarantineRendition(renditionId, dto.reason);
  }

  @Post('renditions/:renditionId/unquarantine')
  @ApiOperation({
    summary:
      'Resolve a quarantine (confirm the copy or reseed with a corrected checksum)',
  })
  @ApiParam({ name: 'renditionId', description: 'Rendition identifier' })
  @ApiResponse({ status: 201, description: 'Quarantine resolved' })
  @ApiResponse({ status: 404, description: 'No integrity record for the rendition' })
  @ApiResponse({ status: 409, description: 'Rendition is not quarantined' })
  @ApiResponse({ status: 422, description: 'Missing corrected checksum for reseed' })
  resolveQuarantine(
    @Param('renditionId') renditionId: string,
    @Body() dto: ResolveQuarantineDto,
  ) {
    return this.integrityService.resolveQuarantine(
      renditionId,
      dto.resolution,
      dto.newSha256,
    );
  }

  @Post('verify')
  @ApiOperation({
    summary:
      'Run one bounded, resumable integrity pass (blocks new access to failed renditions; never deletes)',
  })
  @ApiResponse({ status: 201, description: 'Integrity job progress' })
  @ApiResponse({ status: 422, description: 'batchSize out of range' })
  runVerification(@Body() dto: VerifyJobOptionsDto) {
    return this.integrityService.runIntegrityPass(dto.batchSize);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'List integrity passes' })
  @ApiResponse({ status: 200, description: 'Matching integrity jobs' })
  listJobs(@Query() dto: IntegrityJobQueryDto) {
    return this.integrityService.listJobs(
      { status: dto.status },
      { page: dto.page, limit: dto.limit },
    );
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'View one integrity job' })
  @ApiParam({ name: 'jobId', description: 'Integrity job ObjectId' })
  @ApiResponse({ status: 200, description: 'The integrity job' })
  @ApiResponse({ status: 404, description: 'Integrity job not found' })
  getJob(@Param('jobId') jobId: string) {
    return this.integrityService.getJob(jobId);
  }
}