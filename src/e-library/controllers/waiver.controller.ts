import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WaiverService } from '../services/waiver.service';
import { RequestWaiverDto } from '../dto/request-waiver.dto';
import { DecideWaiverDto } from '../dto/decide-waiver.dto';
import { WaiverStatus } from '../enums/waiver-status.enum';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Waivers & Adjustments')
@Controller('e-library/waivers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WaiverController {
  constructor(private readonly waiverService: WaiverService) {}

  @Post()
  @Roles(Role.MODERATOR, Role.ADMIN)
  @ApiOperation({
    summary:
      "Request a waiver or adjustment for a charge. Auto-applied if within the requesting role's threshold, otherwise queued for approval.",
  })
  request(
    @Body() dto: RequestWaiverDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: Role,
  ) {
    return this.waiverService.requestWaiver(dto, {
      id: actorId,
      role: actorRole,
    });
  }

  @Post(':id/decide')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Approve or reject a pending waiver/adjustment request (admin only)',
  })
  decide(
    @Param('id') id: string,
    @Body() dto: DecideWaiverDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: Role,
  ) {
    return this.waiverService.decideWaiver(id, dto.decision, dto.notes, {
      id: actorId,
      role: actorRole,
    });
  }

  @Get()
  @Roles(Role.MODERATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'List waiver/adjustment requests, optionally filtered',
  })
  list(
    @Query('patronId') patronId?: string,
    @Query('status') status?: WaiverStatus,
  ) {
    return this.waiverService.listWaivers({ patronId, status });
  }

  @Get(':id')
  @Roles(Role.MODERATOR, Role.ADMIN)
  @ApiOperation({ summary: 'Get a single waiver/adjustment request by id' })
  get(@Param('id') id: string) {
    return this.waiverService.getWaiverRequest(id);
  }
}
