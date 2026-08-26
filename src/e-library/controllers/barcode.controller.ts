import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { BarcodeService } from '../services/barcode.service';
import { AssignBarcodeDto, ReassignBarcodeDto } from '../dto/barcode.dto';

@ApiTags('E-Library Barcode')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/barcode', 'v1/library/barcode'])
export class BarcodeController {
  constructor(private readonly barcodeService: BarcodeService) {}

  @Post('assign')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Assign a barcode to a book copy (auto-generates if not provided)' })
  @ApiResponse({ status: 201, description: 'Barcode assigned successfully' })
  @ApiResponse({ status: 409, description: 'Barcode already in use' })
  assignBarcode(@Body() dto: AssignBarcodeDto) {
    return this.barcodeService.assignBarcode(dto.copyId, dto.barcode);
  }

  @Post(':copyId/reassign')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Reassign a barcode (audited, requires reason)' })
  @ApiParam({ name: 'copyId', description: 'Book copy ID' })
  @ApiResponse({ status: 200, description: 'Barcode reassigned' })
  @ApiResponse({ status: 409, description: 'New barcode already in use' })
  reassignBarcode(
    @Param('copyId') copyId: string,
    @Body() dto: ReassignBarcodeDto,
  ) {
    return this.barcodeService.reassignBarcode(copyId, dto.newBarcode, dto.reason);
  }

  @Get('validate/:barcode')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Check if a barcode is available' })
  @ApiParam({ name: 'barcode', description: 'Barcode to validate' })
  validateBarcode(@Param('barcode') barcode: string) {
    return this.barcodeService.validateBarcodeAvailable(barcode);
  }
}
