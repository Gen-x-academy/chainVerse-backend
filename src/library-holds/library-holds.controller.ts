import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LibraryHoldsService } from './library-holds.service';
import { CancelHoldDto } from './dto/cancel-hold.dto';
import { ChangePriorityDto } from './dto/change-priority.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

type AuthedRequest = { user: { id: string; role: string } };

@ApiTags('E-Library Holds')
@ApiBearerAuth('access-token')
@Controller('library')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LibraryHoldsController {
  constructor(private readonly holdsService: LibraryHoldsService) {}

  @Post('books/:bookId/holds')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({
    summary:
      'Place a title-level hold on a book (idempotent while a hold is already active/ready)',
  })
  placeHold(
    @Param('bookId', new ParseObjectIdPipe()) bookId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.holdsService.placeHold(bookId, req.user);
  }

  @Get('holds/me')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: "List the authenticated user's holds" })
  listMyHolds(@Req() req: AuthedRequest) {
    return this.holdsService.listMyHolds(req.user.id);
  }

  @Get('holds/:holdId')
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Get a single hold (owner or staff only)' })
  getHold(
    @Param('holdId', new ParseObjectIdPipe()) holdId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.holdsService.getHold(holdId, req.user);
  }

  @Delete('holds/:holdId')
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      "Cancel a hold (borrowers cancel their own; staff cancelling another user's hold must supply a reason)",
  })
  cancelHold(
    @Param('holdId', new ParseObjectIdPipe()) holdId: string,
    @Req() req: AuthedRequest,
    @Body() dto: CancelHoldDto,
  ) {
    return this.holdsService.cancelHold(holdId, req.user, dto);
  }

  @Patch('holds/:holdId/priority')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Override the priority class of a queued hold (authorized staff only, reason required)',
  })
  changePriority(
    @Param('holdId', new ParseObjectIdPipe()) holdId: string,
    @Req() req: AuthedRequest,
    @Body() dto: ChangePriorityDto,
  ) {
    return this.holdsService.changePriority(holdId, req.user, dto);
  }

  @Post('holds/:holdId/pickup')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary: 'Confirm in-person pickup of a ready physical hold',
  })
  markPickedUp(
    @Param('holdId', new ParseObjectIdPipe()) holdId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.holdsService.markPickedUp(holdId, req.user);
  }

  @Post('copies/:copyId/return')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Mark a copy/license as returned and allocate it to the next queued hold',
  })
  returnCopy(
    @Param('copyId', new ParseObjectIdPipe()) copyId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.holdsService.returnCopy(copyId, req.user);
  }

  @Post('holds/expire-pickups')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Manually run pickup-window expiration (also runs automatically once per hour)',
  })
  async expirePickups() {
    const expired = await this.holdsService.expirePickupWindows();
    return { expired };
  }
}
