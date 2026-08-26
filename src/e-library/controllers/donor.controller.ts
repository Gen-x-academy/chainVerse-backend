import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DonorService } from '../services/donor.service';
import { CreateDonorDto, CreateDonationDto } from '../dto/donor.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('E-Library Acquisitions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/donors', 'v1/library/donors'])
export class DonorController {
  constructor(private readonly donorService: DonorService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Register a new donor' })
  @ApiResponse({ status: 201, description: 'Donor created' })
  createDonor(@Body() dto: CreateDonorDto) {
    return this.donorService.createDonor(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'List all donors' })
  listDonors(@Query() paginationDto: PaginationDto) {
    return this.donorService.listDonors(paginationDto);
  }

  @Get(':donorId')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Get donor details (access-controlled)' })
  @ApiParam({ name: 'donorId', description: 'Donor ID' })
  getDonor(@Param('donorId') donorId: string) {
    return this.donorService.getDonor(donorId);
  }

  @Patch(':donorId/acknowledgment')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Update donor acknowledgment status' })
  @ApiParam({ name: 'donorId', description: 'Donor ID' })
  updateAcknowledgment(
    @Param('donorId') donorId: string,
    @Body('status') status: string,
  ) {
    return this.donorService.updateAcknowledgment(donorId, status as any);
  }

  @Post('donations')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Record a donation with provenance tracking' })
  @ApiResponse({ status: 201, description: 'Donation recorded' })
  createDonation(
    @CurrentUser('sub') receivedBy: string,
    @Body() dto: CreateDonationDto,
  ) {
    return this.donorService.createDonation(dto, receivedBy);
  }

  @Get('donations/list')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'List all donations' })
  listDonations(
    @Query('donorId') donorId?: string,
    @Query() paginationDto?: PaginationDto,
  ) {
    return this.donorService.listDonations(donorId, paginationDto);
  }
}
