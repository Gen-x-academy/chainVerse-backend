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
import { BorrowingSuspensionService } from '../services/borrowing-suspension.service';
import {
  CreateSuspensionDto,
  LiftSuspensionDto,
} from '../dto/borrowing-suspension.dto';

interface AuthenticatedRequest {
  user: { id: string; role: string };
}

@ApiBearerAuth('access-token')
@ApiTags('E-Library Borrowing Suspensions')
@Controller('e-library/suspensions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BorrowingSuspensionController {
  constructor(
    private readonly suspensionService: BorrowingSuspensionService,
  ) {}

  /**
   * GET /e-library/suspensions/patron/:patronId/check
   *
   * Evaluates current thresholds for a patron without modifying state.
   * Returns whether a suspension would apply and which dimension triggered it.
   */
  @Get('patron/:patronId/check')
  @Roles(Role.MODERATOR, Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({
    summary: 'Check whether a patron meets suspension thresholds',
    description:
      'Read-only threshold check: evaluates overdue count, overdue age, and unpaid balance. ' +
      'Returns the first exceeded dimension and remediation message. Does not modify state.',
  })
  @ApiParam({ name: 'patronId', description: 'Patron user ID' })
  checkThresholds(@Param('patronId') patronId: string) {
    return this.suspensionService.checkThresholds(patronId);
  }

  /**
   * POST /e-library/suspensions/patron/:patronId/reconcile
   *
   * Trigger a threshold reconciliation for a patron. Applies or lifts
   * suspension based on the current state of their account.
   */
  @Post('patron/:patronId/reconcile')
  @Roles(Role.MODERATOR, Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({
    summary: 'Reconcile suspension state for a patron',
    description:
      'Evaluates thresholds and applies or lifts suspension accordingly. ' +
      'Called automatically after returns and payments; can also be triggered manually.',
  })
  @ApiParam({ name: 'patronId', description: 'Patron user ID' })
  reconcile(
    @Param('patronId') patronId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.suspensionService.reconcile(
      patronId,
      `staff:${req.user.id}`,
    );
  }

  /**
   * POST /e-library/suspensions
   *
   * Manually suspend a patron's borrowing access (staff-initiated).
   * Returns and account access are not affected by suspension.
   */
  @Post()
  @Roles(Role.MODERATOR, Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({
    summary: 'Manually suspend a patron\'s borrowing access',
    description:
      'Staff-initiated suspension. Returns and account access are always permitted. ' +
      'The patron receives a message explaining the reason and remediation steps.',
  })
  suspend(
    @Body() dto: CreateSuspensionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.suspensionService.suspend(dto, req.user.id);
  }

  /**
   * POST /e-library/suspensions/:id/lift
   *
   * Lift an active suspension as a staff exception/override.
   * Maker-checker enforced: the staff member who created the suspension
   * cannot also lift it.
   */
  @Post(':id/lift')
  @Roles(Role.MODERATOR, Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({
    summary: 'Lift an active suspension as a staff exception',
    description:
      'Grants an authorized exception. Maker-checker rule: the actor who ' +
      'created the suspension cannot be the one to lift it.',
  })
  @ApiParam({ name: 'id', description: 'BorrowingSuspension document ID' })
  liftException(
    @Param('id') id: string,
    @Body() dto: LiftSuspensionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.suspensionService.liftException(id, dto, req.user.id);
  }

  /**
   * GET /e-library/suspensions/patron/:patronId
   *
   * List suspension history for a patron.
   * Students and tutors can only view their own records.
   */
  @Get('patron/:patronId')
  @Roles(Role.STUDENT, Role.TUTOR, Role.MODERATOR, Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'List suspension history for a patron' })
  @ApiParam({ name: 'patronId', description: 'Patron user ID' })
  @ApiQuery({
    name: 'activeOnly',
    required: false,
    description: 'Return only the currently active suspension',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max records to return (default 50)',
  })
  listForPatron(
    @Param('patronId') patronId: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('limit') limit?: string,
    @Request() req?: AuthenticatedRequest,
  ) {
    const role = req?.user?.role as Role | undefined;
    const effectivePatronId =
      role === Role.STUDENT || role === Role.TUTOR
        ? req!.user.id
        : patronId;

    return this.suspensionService.listForPatron(
      effectivePatronId,
      activeOnly === 'true',
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * GET /e-library/suspensions/patron/:patronId/active
   *
   * Get the currently active suspension for a patron, or null.
   */
  @Get('patron/:patronId/active')
  @Roles(Role.STUDENT, Role.TUTOR, Role.MODERATOR, Role.LIBRARIAN, Role.ADMIN)
  @ApiOperation({ summary: 'Get the currently active suspension for a patron' })
  @ApiParam({ name: 'patronId', description: 'Patron user ID' })
  getActive(
    @Param('patronId') patronId: string,
    @Request() req?: AuthenticatedRequest,
  ) {
    const role = req?.user?.role as Role | undefined;
    const effectivePatronId =
      role === Role.STUDENT || role === Role.TUTOR
        ? req!.user.id
        : patronId;

    return this.suspensionService.getActiveSuspension(effectivePatronId);
  }
}
