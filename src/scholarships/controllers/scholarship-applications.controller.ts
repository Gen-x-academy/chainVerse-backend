import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { ScholarshipApplicationsService } from '../services/scholarship-applications.service';
import { CreateScholarshipApplicationDto } from '../dto/scholarship-application.dto';

@ApiBearerAuth('access-token')
@ApiTags('Scholarships — Applications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@Controller('scholarships/applications')
export class ScholarshipApplicationsController {
  constructor(
    private readonly applicationsService: ScholarshipApplicationsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Apply to an open program, accepting a specific published terms revision',
  })
  @ApiResponse({ status: 201, description: 'Application submitted with accepted terms snapshot' })
  @ApiResponse({ status: 404, description: 'Program or terms revision not found' })
  @ApiResponse({ status: 409, description: 'Program not open, revision not published, or duplicate application' })
  apply(
    @Body() dto: CreateScholarshipApplicationDto,
    @CurrentUser('sub') applicantId: string,
  ) {
    return this.applicationsService.apply(dto, applicantId);
  }

  @Get('me')
  @ApiOperation({ summary: 'List my scholarship applications' })
  listMine(@CurrentUser('sub') applicantId: string) {
    return this.applicationsService.listMine(applicantId);
  }

  @Get(':applicationId')
  @ApiOperation({ summary: 'Get one of my applications (with accepted terms snapshot)' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  get(
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @CurrentUser('sub') applicantId: string,
  ) {
    return this.applicationsService.getApplicationForApplicant(
      applicationId,
      applicantId,
    );
  }

  @Delete(':applicationId')
  @ApiOperation({ summary: 'Withdraw my application' })
  @ApiResponse({ status: 200, description: 'Application withdrawn' })
  @ApiResponse({ status: 409, description: 'Application can no longer be withdrawn' })
  withdraw(
    @Param('applicationId', new ParseObjectIdPipe()) applicationId: string,
    @CurrentUser('sub') applicantId: string,
  ) {
    return this.applicationsService.withdraw(applicationId, applicantId);
  }
}