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
import { CreateTutorAccountSettingsDto } from './dto/create-tutor-account-settings.dto';
import { UpdateTutorAccountSettingsDto } from './dto/update-tutor-account-settings.dto';
import { TutorAccountSettingsService } from './tutor-account-settings.service';

@ApiBearerAuth('access-token')
@ApiTags('Tutor Account Settings')
@Controller('tutor/account-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TutorAccountSettingsController {
  constructor(private readonly service: TutorAccountSettingsService) {}

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'List all tutor settings (staff only)' })
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  @Roles(Role.TUTOR)
  @ApiOperation({ summary: "Get the caller's own settings" })
  findMine(@CurrentUser('sub') id: string, @CurrentUser('role') role: string) {
    return this.service.findMine(this.actor(id, role));
  }

  @Patch('me')
  @Roles(Role.TUTOR)
  @ApiOperation({ summary: "Update the caller's own settings" })
  updateMine(
    @Body() payload: UpdateTutorAccountSettingsDto,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.updateMine(payload, this.actor(id, role));
  }

  @Post()
  @Roles(Role.TUTOR)
  @ApiOperation({ summary: "Create the caller's own settings" })
  create(
    @Body() payload: CreateTutorAccountSettingsDto,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.create(payload, this.actor(id, role));
  }

  @Get(':id')
  @Roles(Role.TUTOR, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Get settings by id (owner or staff)' })
  findOne(
    @Param('id', new ParseObjectIdPipe()) settingsId: string,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.findOne(settingsId, this.actor(id, role));
  }

  @Patch(':id')
  @Roles(Role.TUTOR, Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Update settings by id (owner only)' })
  update(
    @Param('id', new ParseObjectIdPipe()) settingsId: string,
    @Body() payload: UpdateTutorAccountSettingsDto,
    @CurrentUser('sub') id: string,
    @CurrentUser('role') role: string,
  ) {
    return this.service.update(settingsId, payload, this.actor(id, role));
  }

  @Delete(':id')
  @Roles(Role.TUTOR, Role.ADMIN, Role.MODERATOR)
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
