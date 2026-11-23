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
  CancelRematchDto,
  CloseRematchDto,
  PlanClosureDto,
  ProposeSuccessorDto,
  RequestRematchDto,
  ReviewRematchDto,
} from './dto/rematch.dto';
import { RematchActor, RematchService } from './rematch.service';

interface JwtClaims {
  sub: string;
  role?: string;
}

const actorOf = (claims: JwtClaims): RematchActor => ({
  id: claims.sub,
  role: claims.role ?? '',
});

@ApiTags('Mentorship Rematch Workflow')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('mentorship/rematch')
export class RematchController {
  constructor(private readonly service: RematchService) {}

  @Post()
  @ApiOperation({ summary: 'Request a rematch with a private reason' })
  request(@CurrentUser() claims: JwtClaims, @Body() dto: RequestRematchDto) {
    return this.service.request(actorOf(claims), dto);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Aggregate, non-blaming rematch process metrics' })
  metrics() {
    return this.service.metrics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a rematch request (private reason scoped to requester)' })
  get(
    @CurrentUser() claims: JwtClaims,
    @Param('id', new ParseObjectIdPipe()) id: string,
  ) {
    return this.service.get(actorOf(claims), id);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Append-only transition history' })
  history(
    @CurrentUser() claims: JwtClaims,
    @Param('id', new ParseObjectIdPipe()) id: string,
  ) {
    return this.service.history(actorOf(claims), id);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Coordinator reviews a rematch request' })
  review(
    @CurrentUser() claims: JwtClaims,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: ReviewRematchDto,
  ) {
    return this.service.review(actorOf(claims), id, dto);
  }

  @Post(':id/closure-plan')
  @ApiOperation({ summary: 'Record a non-blaming continuity/closure plan' })
  plan(
    @CurrentUser() claims: JwtClaims,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: PlanClosureDto,
  ) {
    return this.service.planClosure(actorOf(claims), id, dto);
  }

  @Post(':id/successor')
  @ApiOperation({ summary: 'Propose a successor (blocked by open cases)' })
  successor(
    @CurrentUser() claims: JwtClaims,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: ProposeSuccessorDto,
  ) {
    return this.service.proposeSuccessor(actorOf(claims), id, dto);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close a rematch (blocked by open cases)' })
  close(
    @CurrentUser() claims: JwtClaims,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: CloseRematchDto,
  ) {
    return this.service.close(actorOf(claims), id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an open rematch request' })
  cancel(
    @CurrentUser() claims: JwtClaims,
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: CancelRematchDto,
  ) {
    return this.service.cancel(actorOf(claims), id, dto);
  }
}
