import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { DigitalCheckoutService } from '../services/digital-checkout.service';
import { DigitalReturnService } from '../services/digital-return.service';
import { DigitalCheckoutDto } from '../dto/digital-checkout.dto';
import { DigitalReturnDto } from '../dto/digital-return.dto';

@ApiTags('E-Library Digital Circulation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/circulation/digital', 'v1/library/circulation/digital'])
export class DigitalCirculationController {
  constructor(
    private readonly checkoutService: DigitalCheckoutService,
    private readonly returnService: DigitalReturnService,
  ) {}

  @Post('checkout')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: 'Borrow a digital edition (reserves license atomically)' })
  @ApiResponse({ status: 201, description: 'Digital loan created' })
  @ApiResponse({ status: 409, description: 'No licenses available or patron limit reached' })
  checkout(@Body() dto: DigitalCheckoutDto) {
    return this.checkoutService.checkout(
      dto.patronId,
      dto.bookId,
      dto.editionId,
      dto.format,
    );
  }

  @Post('return')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: 'Return a digital edition early (releases license)' })
  @ApiResponse({ status: 200, description: 'Digital loan returned, access revoked' })
  @ApiResponse({ status: 409, description: 'Loan already returned or not owned by caller' })
  returnDigital(@Body() dto: DigitalReturnDto) {
    return this.returnService.returnDigitalLoan(dto.loanId, dto.patronId);
  }
}
