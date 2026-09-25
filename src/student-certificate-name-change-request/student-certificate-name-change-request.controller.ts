import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestActor } from '../common/auth/resource-owner';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CreateStudentCertificateNameChangeRequestDto } from './dto/create-student-certificate-name-change-request.dto';
import { ReviewNameChangeRequestDto } from './dto/review-name-change-request.dto';
import { UpdateStudentCertificateNameChangeRequestDto } from './dto/update-student-certificate-name-change-request.dto';
import type { NameChangeStatus } from './schemas/certificate-name-change-request.schema';
import { StudentCertificateNameChangeRequestService } from './student-certificate-name-change-request.service';

/**
 * Student-facing routes act on the caller's own requests only; the owner id
 * comes from the JWT and is enforced again in the service.
 */
@ApiBearerAuth('access-token')
@ApiTags('Student Certificate Name Change Requests')
@Controller('student/certificates/name-change-request')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentCertificateNameChangeRequestController {
  constructor(
    private readonly service: StudentCertificateNameChangeRequestService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'List all name change requests (staff only)' })
  findAll(@Query('status') status?: NameChangeStatus) {
    return this.service.findAll(status);
  }

  @Get('me')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: "List the caller's own requests" })
  findMine(@CurrentUser('sub') id: string, @CurrentUser('role') role: string) {
    return this.service.findMine(this.actor(id, role));
  }

  @Post()
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'File a name change request for the caller' })
  create(
    @Body() payload: CreateStudentCertificateNameChangeRequestDto,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.create(payload, this.actor(id, role));
  }

  @Get(':id')
  @Roles(Role.STUDENT, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Get a request by id (owner or staff)' })
  findOne(
    @Param('id', new ParseObjectIdPipe()) requestId: string,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.findOne(requestId, this.actor(id, role));
  }

  @Patch(':id')
  @Roles(Role.STUDENT, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Edit a pending request (owner only)' })
  update(
    @Param('id', new ParseObjectIdPipe()) requestId: string,
    @Body() payload: UpdateStudentCertificateNameChangeRequestDto,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.update(requestId, payload, this.actor(id, role));
  }

  @Post(':id/review')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Approve or reject a request (staff only)' })
  review(
    @Param('id', new ParseObjectIdPipe()) requestId: string,
    @Body() dto: ReviewNameChangeRequestDto,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.review(requestId, dto, this.actor(id, role));
  }

  @Delete(':id')
  @Roles(Role.STUDENT, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Withdraw a pending request (owner) or delete (staff)',
  })
  remove(
    @Param('id', new ParseObjectIdPipe()) requestId: string,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.remove(requestId, this.actor(id, role));
  }

  private actor(id: string, role: string): RequestActor {
    return { id, role };
  }
}
