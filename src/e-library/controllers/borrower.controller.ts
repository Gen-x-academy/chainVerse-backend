import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BorrowerLoansService } from '../services/borrower-loans.service';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('E-Library Borrower')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/borrower', 'v1/library/borrower'])
export class BorrowerController {
  constructor(private readonly borrowerLoansService: BorrowerLoansService) {}

  @Get('loans/current')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: "List the caller's active loans with due dates and renewal eligibility" })
  getCurrentLoans(
    @CurrentUser('sub') patronId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.borrowerLoansService.getCurrentLoansWithDetails(patronId, paginationDto);
  }

  @Get('loans/history')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: "List the caller's completed loans (history)" })
  getLoanHistory(
    @CurrentUser('sub') patronId: string,
    @Query() paginationDto: PaginationDto,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.borrowerLoansService.getLoanHistory(patronId, paginationDto, {
      startDate,
      endDate,
    });
  }
}
