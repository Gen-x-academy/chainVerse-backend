import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequestActor } from '../common/auth/resource-owner';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { CreateStudentAccountSettingsDto } from './dto/create-student-account-settings.dto';
import { UpdateStudentAccountSettingsDto } from './dto/update-student-account-settings.dto';
import { StudentAccountSettingsService } from './student-account-settings.service';

/**
 * Every handler passes the JWT identity to the service, which is where the
 * ownership rule lives — no route accepts an owner id from the client.
 */
@ApiBearerAuth('access-token')
@ApiTags('Student Account Settings')
@Controller('student/account-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentAccountSettingsController {
  constructor(private readonly service: StudentAccountSettingsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'List all student settings (staff only)' })
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: "Get the caller's own settings" })
  findMine(@CurrentUser('sub') id: string, @CurrentUser('role') role: string) {
    return this.service.findMine(this.actor(id, role));
  }

  @Patch('me')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: "Update the caller's own settings" })
  updateMine(
    @Body() payload: UpdateStudentAccountSettingsDto,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.updateMine(payload, this.actor(id, role));
  }

  @Post()
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: "Create the caller's own settings" })
  create(
    @Body() payload: CreateStudentAccountSettingsDto,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.create(payload, this.actor(id, role));
  }

  @Get(':id')
  @Roles(Role.STUDENT, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Get settings by id (owner or staff)' })
  findOne(
    @Param('id', new ParseObjectIdPipe()) settingsId: string,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.findOne(settingsId, this.actor(id, role));
  }

  @Patch(':id')
  @Roles(Role.STUDENT, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Update settings by id (owner only)' })
  update(
    @Param('id', new ParseObjectIdPipe()) settingsId: string,
    @Body() payload: UpdateStudentAccountSettingsDto,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.update(settingsId, payload, this.actor(id, role));
  }

  @Delete(':id')
  @Roles(Role.STUDENT, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Delete settings by id (owner or staff)' })
  remove(
    @Param('id', new ParseObjectIdPipe()) settingsId: string,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.remove(settingsId, this.actor(id, role));
  }

  private actor(id: string, role: string): RequestActor {
    return { id, role };
  }
}
