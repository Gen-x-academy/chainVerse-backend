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
import { RemovalRequestService } from './removal-request.service';
import { CreateRemovalRequestDto } from './dto/create-removal-request.dto';
import { UpdateRemovalRequestDto } from './dto/update-removal-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('removal-requests')
@UseGuards(JwtAuthGuard)
export class RemovalRequestController {
  constructor(private readonly service: RemovalRequestService) {}

  @Post()
  create(
    @Req() req: { user: { id: string } },
    @Body() payload: CreateRemovalRequestDto,
  ) {
    return this.service.create(req.user.id, payload);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  findMyRequests(@Req() req: { user: { id: string } }) {
    return this.service.findByUser(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/moderate')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  moderate(@Param('id') id: string, @Body() payload: UpdateRemovalRequestDto) {
    return this.service.moderate(id, payload);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
