import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Session')
@ApiBearerAuth('access-token')
@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionController {
  constructor(private readonly service: SessionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new session for the authenticated user' })
  create(
    @Req() req: { user: { id: string } },
    @Body() payload: CreateSessionDto,
  ) {
    return this.service.create(req.user.id, payload);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get all active sessions for the authenticated user' })
  findMySessions(@Req() req: { user: { id: string } }) {
    return this.service.findActiveByUserId(req.user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get all sessions (Admin only)' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a session by ID' })
  findOne(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.service.findOne(id, req.user.id);
  }

  @Patch(':id/invalidate')
  @ApiOperation({ summary: 'Invalidate (deactivate) a specific session by ID' })
  invalidate(
    @Param('id', new ParseObjectIdPipe()) id: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.service.invalidate(id, req.user.id);
  }

  @Post('invalidate-all-except-current')
  @ApiOperation({ summary: 'Invalidate all sessions except the current one' })
  invalidateAllExceptCurrent(@Req() req: { user: { id: string }, sessionId: string }) {
    return this.service.invalidateAllExceptCurrent(req.user.id, req.sessionId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a session by ID (Admin only)' })
  remove(@Param('id', new ParseObjectIdPipe()) id: string) {
    return this.service.remove(id);
  }
}