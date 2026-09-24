import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { SanctionService } from './sanction.service';
import { CreateSanctionDto } from './dto/create-sanction.dto';
import { AppealSanctionDto } from './dto/appeal-sanction.dto';
import { ReviewAppealDto } from './dto/review-appeal.dto';

@ApiTags('sanctions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('sanctions')
export class SanctionController {
  constructor(private readonly sanctionService: SanctionService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Issue a sanction against a user' })
  create(
    @Req() req: { user: { id: string } },
    @Body() dto: CreateSanctionDto,
  ) {
    return this.sanctionService.create(req.user.id, dto);
  }

  @Get('user/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'List sanctions for a user' })
  findByUser(@Param('userId') userId: string) {
    return this.sanctionService.findByUser(userId);
  }

  @Patch(':id/appeal')
  @ApiOperation({ summary: 'Submit an appeal for a sanction' })
  appeal(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Req() req: { user: { id: string } },
    @Body() dto: AppealSanctionDto,
  ) {
    return this.sanctionService.appeal(id, req.user.id, dto);
  }

  @Patch(':id/appeal/review')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Review and decide on a sanction appeal' })
  reviewAppeal(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Req() req: { user: { id: string } },
    @Body() dto: ReviewAppealDto,
  ) {
    return this.sanctionService.reviewAppeal(id, req.user.id, dto);
  }
}
