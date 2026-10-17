import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { ManageMentorshipProgramDto } from './dto/manage-mentorship-program.dto';
import { MentorshipProgramService } from './mentorship-program.service';

@ApiTags('Mentorship Programs')
@ApiBearerAuth('access-token')
@Controller('mentorship/programs')
export class MentorshipProgramController {
  constructor(private readonly service: MentorshipProgramService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Create a mentorship program delivery configuration' })
  create(@Body() dto: ManageMentorshipProgramDto, @CurrentUser('sub') userId: string, @CurrentUser('role') role: string) {
    return this.service.create(dto, userId, role);
  }

  @Patch(':programId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Update delivery configuration; blocked when active bookings make it unsafe' })
  update(@Param('programId', new ParseObjectIdPipe()) programId: string, @Body() dto: ManageMentorshipProgramDto, @CurrentUser('sub') userId: string, @CurrentUser('role') role: string) {
    return this.service.update(programId, dto, userId, role);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Discover programs using privacy-safe delivery labels' })
  discover(@Query('organizationId') organizationId?: string) {
    return this.service.discover(organizationId);
  }

  @Get(':programId')
  @Public()
  get(@Param('programId', new ParseObjectIdPipe()) programId: string) {
    return this.service.get(programId);
  }
}
