import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TutorReportsAnalyticsService } from './tutor-reports-analytics.service';
import { CreateTutorReportsAnalyticsDto } from './dto/create-tutor-reports-analytics.dto';
import { UpdateTutorReportsAnalyticsDto } from './dto/update-tutor-reports-analytics.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('tutor/reports-analytics')
export class TutorReportsAnalyticsController {
  constructor(private readonly service: TutorReportsAnalyticsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  create(@Body() payload: CreateTutorReportsAnalyticsDto) {
    return this.service.create(payload);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR, Role.TUTOR)
  update(@Param('id') id: string, @Body() payload: UpdateTutorReportsAnalyticsDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
