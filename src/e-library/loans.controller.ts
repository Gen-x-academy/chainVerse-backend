import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { ToggleAutoRenewDto } from './dto/toggle-auto-renew.dto';

@ApiTags('E-Library')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/loans', 'v1/library/loans'])
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Check a book edition out to a patron (staff)' })
  @ApiResponse({ status: 404, description: 'Book not found' })
  @ApiResponse({ status: 409, description: 'No copies available' })
  checkout(@Body() dto: CreateLoanDto) {
    return this.loansService.checkout(dto);
  }

  @Get()
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: "List the caller's own loans" })
  listMyLoans(
    @CurrentUser('sub') patronId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.loansService.listMyLoans(patronId, paginationDto);
  }

  @Post(':id/renew')
  @Roles(Role.STUDENT)
  @ApiOperation({
    summary: "Self-service renewal of the caller's own active loan",
  })
  @ApiResponse({ status: 403, description: 'Caller does not own this loan' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  @ApiResponse({
    status: 409,
    description:
      'Loan is not active/overdue, renewal limit reached, the copy is flagged, or another patron holds this book',
  })
  renew(
    @Param('id') id: string,
    @CurrentUser('sub') patronId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.loansService.renewLoan(id, {
      id: patronId,
      role,
    } satisfies RequestActor);
  }

  @Patch(':id/auto-renew')
  @Roles(Role.STUDENT)
  @ApiOperation({
    summary: "Opt the caller's own loan in or out of automatic renewal",
  })
  @ApiResponse({ status: 403, description: 'Caller does not own this loan' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  setAutoRenew(
    @Param('id') id: string,
    @CurrentUser('sub') patronId: string,
    @CurrentUser('role') role: string,
    @Body() dto: ToggleAutoRenewDto,
  ) {
    return this.loansService.setAutoRenew(
      id,
      { id: patronId, role } satisfies RequestActor,
      dto,
    );
  }
}
