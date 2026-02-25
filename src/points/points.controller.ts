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
import { PointsService } from './points.service';
import { CreatePointsDto } from './dto/create-points.dto';
import { UpdatePointsDto } from './dto/update-points.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('points')
@UseGuards(JwtAuthGuard)
export class PointsController {
  constructor(private readonly service: PointsService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  getMyPoints(@Req() req: { user: { id: string } }) {
    return this.service.getUserPoints(req.user.id);
  }

  @Get('user/:userId')
  getUserPoints(@Param('userId') userId: string) {
    return this.service.getUserPoints(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  awardPoints(@Body() payload: CreatePointsDto) {
    return this.service.awardPoints(payload);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  update(@Param('id') id: string, @Body() payload: UpdatePointsDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
