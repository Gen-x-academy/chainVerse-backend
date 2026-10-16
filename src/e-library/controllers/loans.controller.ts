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
import { LoanService } from '../services/loan.service';
import { CreateLoanDto } from '../dto/create-loan.dto';
import { LoanStatus } from '../enums/loan-status.enum';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Loans')
@Controller('e-library/loans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoansController {
  constructor(private readonly loanService: LoanService) {}

  @Post()
  @Roles(Role.MODERATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Check out a loan for a patron (librarian/admin only)',
  })
  create(@Body() dto: CreateLoanDto) {
    return this.loanService.createLoan(dto);
  }

  @Get()
  @Roles(Role.MODERATOR, Role.ADMIN)
  @ApiOperation({
    summary: 'List loans, optionally filtered by patron or status',
  })
  list(
    @Query('patronId') patronId?: string,
    @Query('status') status?: LoanStatus,
  ) {
    return this.loanService.listLoans({ patronId, status });
  }

  @Get(':id')
  @Roles(Role.MODERATOR, Role.ADMIN)
  @ApiOperation({ summary: 'Get a single loan by id' })
  get(@Param('id') id: string) {
    return this.loanService.getLoan(id);
  }

  @Post(':id/return')
  @Roles(Role.MODERATOR, Role.ADMIN)
  @ApiOperation({ summary: 'Mark a loan as returned' })
  returnLoan(@Param('id') id: string) {
    return this.loanService.returnLoan(id);
  }
}
