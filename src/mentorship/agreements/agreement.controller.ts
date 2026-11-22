import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { MentorshipUser } from '../shared/mentorship-context';
import { AgreementService } from './agreement.service';
import {
  AddApprovalDto,
  CreateAgreementDto,
  EndAgreementDto,
} from './dto/agreement.dto';

@ApiTags('Mentorship Agreements')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/agreements')
export class AgreementController {
  constructor(private readonly service: AgreementService) {}

  @Post()
  @ApiOperation({ summary: 'Create a draft engagement agreement' })
  @ApiCreatedResponse({ description: 'Draft agreement with versioned terms.' })
  create(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Body() dto: CreateAgreementDto,
  ) {
    return this.service.create(this.user(raw), dto);
  }

  @Post(':id/approvals')
  @ApiOperation({ summary: 'Record a version-bound approval' })
  @ApiCreatedResponse({ description: 'Agreement with the appended approval.' })
  approve(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: AddApprovalDto,
  ) {
    return this.service.addApproval(this.user(raw), id, dto);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate once all configured approvals are present' })
  @ApiOkResponse({ description: 'Active, immutable agreement.' })
  activate(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Param('id', new ParseObjectIdPipe()) id: string,
  ) {
    return this.service.activate(this.user(raw), id);
  }

  @Post(':id/end')
  @ApiOperation({ summary: 'End an active agreement' })
  @ApiOkResponse({ description: 'Ended agreement.' })
  end(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: EndAgreementDto,
  ) {
    return this.service.end(this.user(raw), id, dto);
  }

  @Get(':id/snapshot')
  @ApiOperation({ summary: 'Participant-readable snapshot without private notes' })
  @ApiOkResponse({ description: 'Privacy-safe agreement snapshot.' })
  snapshot(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Param('id', new ParseObjectIdPipe()) id: string,
  ) {
    return this.service.snapshot(this.user(raw), id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full agreement record (coordinators only)' })
  @ApiOkResponse({ description: 'Agreement including the coordinator note.' })
  inspect(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Param('id', new ParseObjectIdPipe()) id: string,
  ) {
    return this.service.inspect(this.user(raw), id);
  }

  @Get('program/:programId')
  @ApiOperation({ summary: 'List agreements for a program (coordinators only)' })
  @ApiOkResponse({ description: 'Agreements ordered newest first.' })
  list(
    @CurrentUser() raw: Record<string, unknown> | undefined,
    @Param('programId', new ParseObjectIdPipe()) programId: string,
  ) {
    return this.service.listForProgram(this.user(raw), programId);
  }

  private user(raw: Record<string, unknown> | undefined): MentorshipUser {
    if (!raw) throw new UnauthorizedException();
    return {
      id: String(raw['sub'] ?? raw['id'] ?? ''),
      email: String(raw['email'] ?? ''),
      role: String(raw['role'] ?? ''),
    };
  }
}
