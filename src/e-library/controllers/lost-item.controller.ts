import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { LostItemService } from '../services/lost-item.service';
import { LostItemStatus } from '../schemas/lost-item.schema';
import { DeclareLostItemDto, ProcessLostItemReturnDto } from '../dto/lost-item.dto';

interface AuthenticatedRequest {
  user: { id: string; role: string };
}

@ApiBearerAuth('access-token')
@ApiTags('E-Library Lost Items')
@Controller('e-library/lost-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LostItemController {
  constructor(private readonly lostItemService: LostItemService) {}

  /**
   * POST /e-library/lost-items
   *
   * Declare a copy lost. Marks the copy LOST, cancels active holds on it,
   * and charges the patron LOST_ITEM_FEE + REPLACEMENT_COST_FEE.
   * Accessible by moderators, librarians, and admins only.
   */
  @Post()
  @Roles(Role.MODERATOR, Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({
    summary: 'Declare a copy lost',
    description:
      'Marks the associated BookCopy as LOST, cancels any active holds on it, ' +
      'and posts LOST_ITEM_FEE and REPLACEMENT_COST_FEE ledger entries against the patron.',
  })
  declare(
    @Body() dto: DeclareLostItemDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.lostItemService.declareLost(dto, req.user.id);
  }

  /**
   * POST /e-library/lost-items/:id/return
   *
   * Process a late return of a copy previously declared lost.
   * Reverses the replacement cost; the processing fee is non-refundable.
   */
  @Post(':id/return')
  @Roles(Role.MODERATOR, Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({
    summary: 'Process late return of a lost copy',
    description:
      'Reverses the REPLACEMENT_COST_FEE via a compensating ledger entry. ' +
      'The LOST_ITEM_FEE (processing) is retained per policy. Restores the copy to AVAILABLE.',
  })
  @ApiParam({ name: 'id', description: 'LostItem record ID' })
  processReturn(
    @Param('id') id: string,
    @Body() dto: ProcessLostItemReturnDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.lostItemService.processReturn(id, dto, req.user.id);
  }

  /**
   * GET /e-library/lost-items/:id
   *
   * Retrieve a single lost-item record.
   */
  @Get(':id')
  @Roles(Role.MODERATOR, Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Get a lost-item record by ID' })
  @ApiParam({ name: 'id', description: 'LostItem document ID' })
  getById(@Param('id') id: string) {
    return this.lostItemService.getById(id);
  }

  /**
   * GET /e-library/lost-items/patron/:patronId
   *
   * List lost-item records for a patron. Admin/moderator may query any patron;
   * students and tutors can only query their own records.
   */
  @Get('patron/:patronId')
  @Roles(Role.STUDENT, Role.TUTOR, Role.MODERATOR, Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'List lost-item records for a patron' })
  @ApiParam({ name: 'patronId', description: 'Patron user ID' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: LostItemStatus,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max records to return (default 50)',
  })
  listForPatron(
    @Param('patronId') patronId: string,
    @Query('status') status?: LostItemStatus,
    @Query('limit') limit?: string,
    @Request() req?: AuthenticatedRequest,
  ) {
    const role = req?.user?.role as Role | undefined;
    const effectivePatronId =
      role === Role.STUDENT || role === Role.TUTOR
        ? req!.user.id
        : patronId;

    return this.lostItemService.listForPatron(
      effectivePatronId,
      status,
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
