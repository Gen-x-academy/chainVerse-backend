import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  AgreementAmendmentService,
  AmendmentActor,
} from './agreement-amendment.service';
import {
  ActivateAmendmentDto,
  ApproveAmendmentDto,
  PreviewAmendmentDto,
  ProposeAmendmentDto,
  RejectAmendmentDto,
} from './dto/agreement-amendment.dto';

interface JwtClaims {
  sub: string;
  role?: string;
}

const actorOf = (claims: JwtClaims): AmendmentActor => ({
  id: claims.sub,
  role: claims.role ?? '',
});

@ApiTags('Mentorship Agreement Amendments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/agreements/:agreementId/amendments')
export class AgreementAmendmentController {
  constructor(private readonly service: AgreementAmendmentService) {}

  @Post('preview')
  @ApiOperation({ summary: 'Preview the impact of a proposed change (no write)' })
  preview(
    @CurrentUser() claims: JwtClaims,
    @Body() dto: PreviewAmendmentDto,
  ) {
    return this.service.preview(actorOf(claims), dto);
  }

  @Post()
  @ApiOperation({ summary: 'Propose a versioned amendment (inert until activated)' })
  propose(
    @CurrentUser() claims: JwtClaims,
    @Param('agreementId', new ParseObjectIdPipe()) agreementId: string,
    @Body() dto: ProposeAmendmentDto,
  ) {
    return this.service.propose(actorOf(claims), agreementId, dto);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get the amendment currently in force' })
  active(@Param('agreementId', new ParseObjectIdPipe()) agreementId: string) {
    return this.service.activeFor(agreementId);
  }

  @Get()
  @ApiOperation({ summary: 'List the immutable amendment history' })
  history(@Param('agreementId', new ParseObjectIdPipe()) agreementId: string) {
    return this.service.history(agreementId);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Append an approval to a proposed amendment' })
  approve(
    @CurrentUser() claims: JwtClaims,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: ApproveAmendmentDto,
  ) {
    return this.service.approve(actorOf(claims), id, dto);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a proposed amendment (agreement stays intact)' })
  reject(
    @CurrentUser() claims: JwtClaims,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: RejectAmendmentDto,
  ) {
    return this.service.reject(actorOf(claims), id, dto);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate an approved amendment so its terms take effect' })
  activate(
    @CurrentUser() claims: JwtClaims,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: ActivateAmendmentDto,
  ) {
    return this.service.activate(actorOf(claims), id, dto);
  }
}
