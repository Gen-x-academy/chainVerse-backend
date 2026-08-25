import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequestActor } from '../common/auth/resource-owner';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { HoldsService } from './holds.service';
import { CreateHoldDto } from './dto/create-hold.dto';

@ApiTags('E-Library')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/holds', 'v1/library/holds'])
export class HoldsController {
  constructor(private readonly holdsService: HoldsService) {}

  @Post()
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Place a hold on a book edition' })
  @ApiResponse({ status: 404, description: 'Book not found' })
  @ApiResponse({
    status: 409,
    description:
      'Active hold limit reached, a duplicate-edition hold/loan exists, or this exact hold already exists',
  })
  createHold(@CurrentUser('sub') patronId: string, @Body() dto: CreateHoldDto) {
    return this.holdsService.createHold(patronId, dto);
  }

  @Get()
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: "List the caller's own holds" })
  listMyHolds(
    @CurrentUser('sub') patronId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.holdsService.listMyHolds(patronId, paginationDto);
  }

  @Get(':id/status')
  @Roles(Role.STUDENT, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      "Get a hold's queue position and a conservative wait estimate. Only the owner (or staff assisting them) can view it, and the response never includes other patrons' identities.",
  })
  @ApiResponse({ status: 403, description: 'Caller does not own this hold' })
  @ApiResponse({ status: 404, description: 'Hold not found' })
  getStatus(
    @Param('id') id: string,
    @CurrentUser('sub') patronId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.holdsService.getHoldStatus(id, {
      id: patronId,
      role,
    } satisfies RequestActor);
  }

  @Delete(':id')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: "Cancel the caller's own hold" })
  @ApiResponse({ status: 403, description: 'Caller does not own this hold' })
  @ApiResponse({ status: 404, description: 'Hold not found' })
  @ApiResponse({ status: 409, description: 'Hold is no longer active' })
  cancelHold(
    @Param('id') id: string,
    @CurrentUser('sub') patronId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.holdsService.cancelHold(id, {
      id: patronId,
      role,
    } satisfies RequestActor);
  }
}
