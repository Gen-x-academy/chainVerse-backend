import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { PhysicalCheckoutService } from '../services/physical-checkout.service';
import { PhysicalReturnService } from '../services/physical-return.service';
import { PhysicalCheckoutDto } from '../dto/physical-checkout.dto';
import { PhysicalReturnDto } from '../dto/physical-return.dto';

@ApiTags('E-Library Circulation')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/circulation/physical', 'v1/library/circulation/physical'])
export class PhysicalCirculationController {
  constructor(
    private readonly checkoutService: PhysicalCheckoutService,
    private readonly returnService: PhysicalReturnService,
  ) {}

  @Post('checkout')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Check out a physical copy by barcode' })
  @ApiResponse({ status: 201, description: 'Checkout successful' })
  @ApiResponse({ status: 409, description: 'Copy not available or patron limit reached' })
  checkout(@Body() dto: PhysicalCheckoutDto) {
    return this.checkoutService.checkout(dto.barcode, dto.patronId, dto.staffId);
  }

  @Post('return')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Return a physical copy by barcode' })
  @ApiResponse({ status: 200, description: 'Return successful' })
  @ApiResponse({ status: 409, description: 'Copy already available or no active loan' })
  returnCopy(@Body() dto: PhysicalReturnDto) {
    return this.returnService.returnCopy(
      dto.barcode,
      dto.disposition,
      dto.condition,
      dto.note,
      dto.staffId,
    );
  }
}
