import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { LocationService } from '../services/location.service';
import { CreateLocationDto, UpdateLocationDto } from '../dto/location.dto';

@ApiTags('E-Library Inventory')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller(['library/locations', 'v1/library/locations'])
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Create a new location (branch, room, or shelf)' })
  @ApiResponse({ status: 201, description: 'Location created' })
  @ApiResponse({ status: 409, description: 'Parent is a shelf (cannot have children)' })
  createLocation(@Body() dto: CreateLocationDto) {
    return this.locationService.createLocation(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.STUDENT, Role.TUTOR)
  @ApiOperation({ summary: 'List all locations' })
  listLocations() {
    return this.locationService.listLocations();
  }

  @Get(':locationId')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Get a location by ID' })
  @ApiParam({ name: 'locationId', description: 'Location ID' })
  getLocation(@Param('locationId') locationId: string) {
    return this.locationService.getLocation(locationId);
  }

  @Get(':locationId/children')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Get child locations' })
  @ApiParam({ name: 'locationId', description: 'Parent location ID' })
  getChildren(@Param('locationId') locationId: string) {
    return this.locationService.getChildren(locationId);
  }

  @Patch(':locationId')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Update a location' })
  @ApiParam({ name: 'locationId', description: 'Location ID' })
  updateLocation(
    @Param('locationId') locationId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationService.updateLocation(locationId, dto);
  }

  @Delete(':locationId')
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Deactivate a location' })
  @ApiParam({ name: 'locationId', description: 'Location ID' })
  @ApiResponse({ status: 409, description: 'Location has active children' })
  deactivateLocation(@Param('locationId') locationId: string) {
    return this.locationService.deactivateLocation(locationId);
  }
}
