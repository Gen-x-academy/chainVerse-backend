import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PatronNoteService } from '../services/patron-note.service';
import { CreatePatronNoteDto } from '../dto/create-patron-note.dto';
import { UpdatePatronNoteDto } from '../dto/update-patron-note.dto';

@ApiBearerAuth('access-token')
@ApiTags('E-Library Patron Notes')
@Controller('e-library/patron-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PatronNoteController {
  constructor(private readonly patronNoteService: PatronNoteService) {}

  @Post()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Create a patron note (staff only)' })
  create(
    @CurrentUser('sub') authorId: string,
    @Body() dto: CreatePatronNoteDto,
  ) {
    return this.patronNoteService.create(dto, authorId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Get a patron note by ID (restricted visibility)' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string; role: string },
  ) {
    return this.patronNoteService.findById(id, { id: actor.sub, role: actor.role });
  }

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'List patron notes for a specific patron' })
  listByPatron(
    @Query('patronId') patronId: string,
    @Query() paginationDto: PaginationDto,
    @CurrentUser() actor: { sub: string; role: string },
  ) {
    return this.patronNoteService.listByPatron(patronId, paginationDto, {
      id: actor.sub,
      role: actor.role,
    });
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Update a patron note' })
  update(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string; role: string },
    @Body() dto: UpdatePatronNoteDto,
  ) {
    return this.patronNoteService.update(id, dto, { id: actor.sub, role: actor.role });
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.MODERATOR, Role.LIBRARIAN)
  @ApiOperation({ summary: 'Soft-delete a patron note' })
  remove(
    @Param('id') id: string,
    @CurrentUser() actor: { sub: string; role: string },
  ) {
    return this.patronNoteService.softDelete(id, { id: actor.sub, role: actor.role });
  }

  @Post('retention/purge')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Purge all expired patron notes (admin only)' })
  purgeExpired() {
    return this.patronNoteService.enforceRetention();
  }
}
