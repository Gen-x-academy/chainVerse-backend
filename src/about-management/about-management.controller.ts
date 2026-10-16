import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AboutManagementService } from './about-management.service';
import { CreateAboutContentRevisionDto } from './dto/create-about-management.dto';
import { UpdateAboutContentRevisionDto } from './dto/update-about-management.dto';
import { RollbackAboutContentRevisionDto } from './dto/rollback-about-content-revision.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('About Content Revisions')
@ApiBearerAuth('access-token')
@Controller('about')
export class AboutManagementController {
  constructor(private readonly service: AboutManagementService) {}

  @Public()
  @Get('published')
  @ApiOperation({ summary: 'Get the currently published about content' })
  findPublished() {
    return this.service.findPublished();
  }

  @Public()
  @Get('revisions')
  @ApiOperation({ summary: 'List all revisions (newest first)' })
  findAllRevisions() {
    return this.service.findAllRevisions();
  }

  @Public()
  @Get('revisions/:id')
  @ApiOperation({ summary: 'Get a single revision by id' })
  findRevisionById(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.findRevisionById(id);
  }

  @Post('revisions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Create a new draft revision (admin / moderator)' })
  createRevision(
    @Body() dto: CreateAboutContentRevisionDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.createRevision(dto, userId);
  }

  @Patch('revisions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Update an existing draft revision' })
  updateRevision(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Body() dto: UpdateAboutContentRevisionDto,
  ) {
    return this.service.updateRevision(id, dto);
  }

  @Post('revisions/:id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Publish a revision (archives previous published)' })
  publishRevision(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.publishRevision(id);
  }

  @Post('revisions/:id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({ summary: 'Archive a revision' })
  archiveRevision(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.archiveRevision(id);
  }

  @Post('revisions/rollback')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiOperation({
    summary:
      'Roll back to a previous revision (creates a new draft copying the target)',
  })
  rollback(
    @Body() dto: RollbackAboutContentRevisionDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.rollback(dto, userId);
  }
}
