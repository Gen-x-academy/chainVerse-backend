import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  AgreementAcceptanceService,
  AcceptanceActor,
} from './agreement-acceptance.service';
import {
  AcceptAgreementDto,
  PublishAgreementTermsDto,
} from './dto/agreement-acceptance.dto';

interface JwtClaims {
  sub: string;
  role?: string;
}

const actorOf = (claims: JwtClaims): AcceptanceActor => ({
  id: claims.sub,
  role: claims.role ?? '',
});

@ApiTags('Mentorship Agreement Acceptance')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/agreements')
export class AgreementAcceptanceController {
  constructor(private readonly service: AgreementAcceptanceService) {}

  @Post('terms')
  @ApiOperation({
    summary: 'Publish a new immutable version of an agreement (coordinator only)',
  })
  publish(@CurrentUser() claims: JwtClaims, @Body() dto: PublishAgreementTermsDto) {
    return this.service.publishTerms(actorOf(claims), dto);
  }

  @Get(':agreementId/terms/current')
  @ApiOperation({
    summary: 'Get the current terms version and hash (never the private body)',
  })
  current(
    @Param('agreementId', new ParseObjectIdPipe()) agreementId: string,
  ) {
    return this.service.currentVersion(agreementId);
  }

  @Post(':agreementId/accept')
  @ApiOperation({
    summary: 'Record explicit, replay-resistant acceptance of the current terms',
  })
  accept(
    @CurrentUser() claims: JwtClaims,
    @Param('agreementId', new ParseObjectIdPipe()) agreementId: string,
    @Body() dto: AcceptAgreementDto,
  ) {
    return this.service.accept(actorOf(claims), agreementId, dto);
  }

  @Get(':agreementId/acceptance')
  @ApiOperation({ summary: 'List client-safe acceptance proofs for an agreement' })
  history(
    @CurrentUser() claims: JwtClaims,
    @Param('agreementId', new ParseObjectIdPipe()) agreementId: string,
  ) {
    return this.service.history(actorOf(claims), agreementId);
  }

  @Get(':agreementId/acceptance/:subjectId')
  @ApiOperation({ summary: 'Get one acceptance proof (self or coordinator only)' })
  proof(
    @CurrentUser() claims: JwtClaims,
    @Param('agreementId', new ParseObjectIdPipe()) agreementId: string,
    @Param('subjectId') subjectId: string,
    @Query('version', ParseIntPipe) version: number,
  ) {
    return this.service.proof(actorOf(claims), agreementId, version, subjectId);
  }
}
