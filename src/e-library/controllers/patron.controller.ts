import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PatronProfileService } from '../services/patron-profile.service';
import { BorrowingPolicyService } from '../services/borrowing-policy.service';
import { CreatePatronProfileDto, UpdatePatronStatusDto } from '../dto/patron.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('E-Library Patrons')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/patrons', 'v1/library/patrons'])
export class PatronController {
  constructor(
    private readonly patronService: PatronProfileService,
    private readonly policyService: BorrowingPolicyService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Create a library patron profile linked to platform identity' })
  @ApiResponse({ status: 201, description: 'Patron profile created' })
  @ApiResponse({ status: 409, description: 'Profile already exists for this user' })
  createProfile(@Body() dto: CreatePatronProfileDto) {
    return this.patronService.createProfile(dto);
  }

  @Get('me')
  @Roles(Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: "Get the caller's own patron profile" })
  getMyProfile(@CurrentUser('sub') userId: string) {
    return this.patronService.getProfile(userId);
  }

  @Get(':userId')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Get a patron profile by user ID (staff only)' })
  @ApiParam({ name: 'userId', description: 'Platform user ID' })
  getProfile(@Param('userId') userId: string) {
    return this.patronService.getProfile(userId);
  }

  @Patch(':userId/status')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Update patron status (active/suspended/blocked/expired)' })
  @ApiParam({ name: 'userId', description: 'Platform user ID' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 409, description: 'Patron is already in this status' })
  updateStatus(
    @Param('userId') userId: string,
    @CurrentUser('sub') changedBy: string,
    @Body() dto: UpdatePatronStatusDto,
  ) {
    return this.patronService.updateStatus(userId, dto, changedBy);
  }

  @Get(':userId/checkout-eligibility')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Check if a patron is eligible for checkout' })
  @ApiParam({ name: 'userId', description: 'Platform user ID' })
  checkEligibility(@Param('userId') userId: string) {
    return this.patronService.isCheckoutAllowed(userId);
  }

  @Get(':userId/policy')
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Resolve borrowing policy for a patron' })
  @ApiParam({ name: 'userId', description: 'Platform user ID' })
  resolvePolicy(@Param('userId') userId: string) {
    return this.policyService.resolvePolicy(userId);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'List all patron profiles' })
  listPatrons(@Query() paginationDto: PaginationDto) {
    return this.patronService.listPatrons(paginationDto);
  }
}
