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
import { ReportAbuseService } from './report-abuse.service';
import { CreateReportAbuseDto } from './dto/create-report-abuse.dto';
import { UpdateReportAbuseDto } from './dto/update-report-abuse.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('report-abuse')
@UseGuards(JwtAuthGuard)
export class ReportAbuseController {
  constructor(private readonly service: ReportAbuseService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT, Role.TUTOR, Role.MODERATOR)
  create(
    @Req() req: { user: { id: string } },
    @Body() payload: CreateReportAbuseDto,
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
  findMyReports(@Req() req: { user: { id: string } }) {
    return this.service.findByReporter(req.user.id);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.MODERATOR)
  update(@Param('id') id: string, @Body() payload: UpdateReportAbuseDto) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
